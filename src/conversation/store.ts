import { randomUUID } from 'node:crypto';

import { Redis } from '@upstash/redis';

import type {
  AbilityType,
  AiStage,
  AudienceGroup,
  FrictionLayer,
  NeedCategory,
} from '@/profiles/resource-index';

// 重新导出 ports 中的数据类型，保持上层引用稳定。
export type {
  AdminReviewStatus,
  AgentRecommendation,
  AuthState,
  FeedbackStatus,
  Incident,
  MatchFeedbackType,
  NeedCase,
  ProfileSnapshot,
  SafetyFlags,
  TopicCandidate,
  UserProfile,
} from '@/stores/ports';

import type {
  ConversationMessage,
  ContentFeedbackEvent,
  ExperienceEvent,
  Incident,
  RuleCandidate,
  SkillCandidate,
  SkillAdmissionStatus,
  MatchFeedbackEvent,
  MatchFeedbackType,
  NeedCase,
  TopicCandidate,
  UserProfile,
  WorkItem,
  WorkItemStatus,
} from '@/stores/ports';

export interface MatchSession {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  lastActiveAt: string;
  sourcePage: string;
  messageCount: number;
  consentForTopic: boolean;
  audienceGroup?: AudienceGroup;
  aiStage?: AiStage;
  isMinorContext: boolean;
  promptVersion: string;
  modelVersion: string;
}

// ---------------------------------------------------------------------------
// 内存降级存储
// ---------------------------------------------------------------------------

const memorySessions = new Map<string, MatchSession>();
const memoryNeedCases = new Map<string, NeedCase>();
const memoryFeedbackEvents = new Map<string, MatchFeedbackEvent>();
const memoryTopicCandidates = new Map<string, TopicCandidate>();
const memoryMessages = new Map<string, ConversationMessage[]>();
const memoryProfiles = new Map<string, UserProfile>();
const memoryIncidents = new Map<string, Incident>();
const memoryExperienceEvents = new Map<string, ExperienceEvent>();
const memoryRuleCandidates = new Map<string, RuleCandidate>();
const memorySkillCandidates = new Map<string, SkillCandidate>();
const memoryWorkItems = new Map<string, WorkItem>();
const memoryContentFeedback = new Map<string, ContentFeedbackEvent>();
let memoryMatchCount = 0;
const memoryCategoryCounts = new Map<string, number>();

let cachedRedis: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const env = import.meta.env as Record<string, string | undefined>;
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) {
    cachedRedis = null;
    return cachedRedis;
  }
  try {
    cachedRedis = new Redis({ url, token });
  } catch {
    cachedRedis = null;
  }
  return cachedRedis;
}

export function createSessionId(): string {
  return randomUUID();
}

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

function sessionKey(sessionId: string): string {
  return `match:session:${sessionId}`;
}

function needCaseKey(needCaseId: string): string {
  return `match:needcase:${needCaseId}`;
}

function feedbackKey(feedbackId: string): string {
  return `match:feedback:${feedbackId}`;
}

function topicKey(topicId: string): string {
  return `match:topic:${topicId}`;
}

function messagesKey(sessionId: string): string {
  return `match:messages:${sessionId}`;
}

function profileKey(profileId: string): string {
  return `match:profile:${profileId}`;
}

/** 按 username 索引画像，账号认证后用 username 取代旧 sessionId */
function profileByUsernameKey(username: string): string {
  return `match:profile-by-username:${username}`;
}

function incidentKey(incidentId: string): string {
  return `match:incident:${incidentId}`;
}

const NEEDCASE_REVIEW_PENDING_LIST = 'match:needcase:review:pending';
const NEEDCASE_TOPICS_UNPROCESSED_LIST = 'match:needcase:topics:unprocessed';
const NEEDCASE_RECENT_LIST = 'match:needcase:recent';

// ---------------------------------------------------------------------------
// 匹配会话
// ---------------------------------------------------------------------------

export async function upsertMatchSession(session: MatchSession): Promise<void> {
  const redis = getRedis();
  memorySessions.set(session.sessionId, session);
  if (!redis) return;

  await redis.set(sessionKey(session.sessionId), session);
  await redis.sadd('match:sessions', session.sessionId);
}

export async function getMatchSession(sessionId: string): Promise<MatchSession | null> {
  const redis = getRedis();
  if (!redis) return memorySessions.get(sessionId) ?? null;

  return (await redis.get<MatchSession>(sessionKey(sessionId))) ?? memorySessions.get(sessionId) ?? null;
}

export async function endMatchSession(sessionId: string, endedAt = new Date().toISOString()): Promise<MatchSession | null> {
  const session = await getMatchSession(sessionId);
  if (!session) return null;

  const endedSession = { ...session, endedAt, lastActiveAt: endedAt };
  await upsertMatchSession(endedSession);
  return endedSession;
}

// ---------------------------------------------------------------------------
// Need Case
// ---------------------------------------------------------------------------

export async function saveNeedCase(needCase: NeedCase): Promise<void> {
  const redis = getRedis();
  memoryNeedCases.set(needCase.needCaseId, needCase);
  if (!redis) return;

  await redis.set(needCaseKey(needCase.needCaseId), needCase);
  if (needCase.adminReviewStatus === 'pending') {
    await redis.lpush(NEEDCASE_REVIEW_PENDING_LIST, needCase.needCaseId);
  }
  if (!needCase.topicProcessedAt) {
    await redis.lpush(NEEDCASE_TOPICS_UNPROCESSED_LIST, needCase.needCaseId);
  }
  await redis.lpush(NEEDCASE_RECENT_LIST, needCase.needCaseId);
  // 最近列表只保留 500 条索引，避免无限增长
  await redis.ltrim(NEEDCASE_RECENT_LIST, 0, 499);
}

export async function getNeedCaseById(needCaseId: string): Promise<NeedCase | null> {
  const redis = getRedis();
  if (!redis) return memoryNeedCases.get(needCaseId) ?? null;
  return (await redis.get<NeedCase>(needCaseKey(needCaseId))) ?? memoryNeedCases.get(needCaseId) ?? null;
}

export async function getNeedCasesBySession(sessionId: string): Promise<NeedCase[]> {
  const redis = getRedis();
  const fromMemory = [...memoryNeedCases.values()].filter(c => c.sessionId === sessionId);
  if (!redis) return fromMemory;

  // Redis 没有按 session 索引；扫最近列表匹配。开发期数据量小，可接受。
  const recent = await getRecentNeedCases(500);
  const bySession = recent.filter(c => c.sessionId === sessionId);
  return bySession.length > 0 ? bySession : fromMemory;
}

/** 账号级联删除：按 username 脱敏关联的所有 NeedCase（清空原始需求 + 切片，保留聚合匿名） */
/** 列出某用户的 NeedCase（admin 详情页用，扫最近 2000 条过滤 username） */
export async function getNeedCasesByUsername(username: string): Promise<NeedCase[]> {
  const all = await getRecentNeedCases(2000);
  return all.filter((c) => c.username === username);
}

export async function redactNeedCasesByUsername(username: string): Promise<void> {
  const cases = await getRecentNeedCases(2000);
  const now = new Date().toISOString();
  for (const c of cases) {
    if (c.username !== username) continue;
    await saveNeedCase({
      ...c,
      rawNeedRedacted: '',
      profileSnapshot: undefined,
      updatedAt: now,
    });
  }
}

export async function getPendingReviewNeedCases(options?: { limit?: number }): Promise<NeedCase[]> {
  const limit = options?.limit ?? 50;
  const redis = getRedis();

  if (!redis) {
    return [...memoryNeedCases.values()]
      .filter(c => c.adminReviewStatus === 'pending')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  const ids = await redis.lrange<string>(NEEDCASE_REVIEW_PENDING_LIST, 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis.get<NeedCase>(needCaseKey(id))));
  return items.filter((c): c is NeedCase => c !== null && c.adminReviewStatus === 'pending');
}

export async function getUnprocessedNeedCases(limit = 50): Promise<NeedCase[]> {
  const redis = getRedis();

  if (!redis) {
    return [...memoryNeedCases.values()]
      .filter(c => !c.topicProcessedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  const ids = await redis.lrange<string>(NEEDCASE_TOPICS_UNPROCESSED_LIST, 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis.get<NeedCase>(needCaseKey(id))));
  return items.filter((c): c is NeedCase => c !== null && !c.topicProcessedAt);
}

export async function getRecentNeedCases(limit = 500): Promise<NeedCase[]> {
  const redis = getRedis();

  if (!redis) {
    return [...memoryNeedCases.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  const ids = await redis.lrange<string>(NEEDCASE_RECENT_LIST, 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis.get<NeedCase>(needCaseKey(id))));
  return items.filter((c): c is NeedCase => c !== null);
}

export async function updateNeedCaseFeedback(needCaseId: string, feedbackStatus: NeedCase['feedbackStatus']): Promise<void> {
  const redis = getRedis();
  const memory = memoryNeedCases.get(needCaseId);
  if (memory) memoryNeedCases.set(needCaseId, { ...memory, feedbackStatus, updatedAt: new Date().toISOString() });

  if (!redis) return;
  const current = await redis.get<NeedCase>(needCaseKey(needCaseId));
  if (!current) return;
  await redis.set(needCaseKey(needCaseId), { ...current, feedbackStatus, updatedAt: new Date().toISOString() });
}

export async function updateNeedCaseAdminReview(
  needCaseId: string,
  status: NeedCase['adminReviewStatus'],
  note?: string,
): Promise<void> {
  const redis = getRedis();
  const now = new Date().toISOString();
  const memory = memoryNeedCases.get(needCaseId);
  if (memory) {
    memoryNeedCases.set(needCaseId, {
      ...memory,
      adminReviewStatus: status,
      adminReviewNote: note ?? memory.adminReviewNote,
      updatedAt: now,
    });
  }

  if (!redis) return;
  const current = await redis.get<NeedCase>(needCaseKey(needCaseId));
  if (!current) return;
  await redis.set(needCaseKey(needCaseId), {
    ...current,
    adminReviewStatus: status,
    adminReviewNote: note ?? current.adminReviewNote,
    updatedAt: now,
  });
  // 离开 pending 后从待复盘列表移除
  if (status !== 'pending') {
    await redis.lrem(NEEDCASE_REVIEW_PENDING_LIST, 0, needCaseId);
  }
}

export async function attachTopicCandidateToNeedCase(needCaseId: string, topicCandidateId: string): Promise<void> {
  const redis = getRedis();
  const memory = memoryNeedCases.get(needCaseId);
  if (memory) {
    memoryNeedCases.set(needCaseId, { ...memory, topicCandidateId, updatedAt: new Date().toISOString() });
  }
  if (!redis) return;
  const current = await redis.get<NeedCase>(needCaseKey(needCaseId));
  if (!current) return;
  await redis.set(needCaseKey(needCaseId), { ...current, topicCandidateId, updatedAt: new Date().toISOString() });
}

export async function markNeedCasesTopicProcessed(needCaseIds: string[], topicCandidateId?: string): Promise<void> {
  const redis = getRedis();
  const now = new Date().toISOString();
  for (const id of needCaseIds) {
    const memory = memoryNeedCases.get(id);
    if (memory) {
      memoryNeedCases.set(id, { ...memory, topicProcessedAt: now, topicCandidateId: topicCandidateId ?? memory.topicCandidateId });
    }
    if (redis) {
      const current = await redis.get<NeedCase>(needCaseKey(id));
      if (current) {
        await redis.set(needCaseKey(id), { ...current, topicProcessedAt: now, topicCandidateId: topicCandidateId ?? current.topicCandidateId });
      }
      await redis.lrem(NEEDCASE_TOPICS_UNPROCESSED_LIST, 0, id);
    }
  }
}

// ---------------------------------------------------------------------------
// 用户画像（按 username 索引）
// ---------------------------------------------------------------------------

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const redis = getRedis();
  memoryProfiles.set(profile.profileId, profile);
  if (!redis) return;
  await redis.set(profileKey(profile.profileId), profile);
  await redis.set(profileByUsernameKey(profile.username), profile);
}

export async function getUserProfileByUsername(username: string): Promise<UserProfile | null> {
  const redis = getRedis();
  const fromMemory = [...memoryProfiles.values()].find(p => p.username === username) ?? null;
  if (!redis) return fromMemory;
  return (await redis.get<UserProfile>(profileByUsernameKey(username))) ?? fromMemory;
}

/** 物理删画像（删账号级联用） */
export async function deleteUserProfileByUsername(username: string): Promise<void> {
  for (const [pid, p] of memoryProfiles) {
    if (p.username === username) memoryProfiles.delete(pid);
  }
  const redis = getRedis();
  if (!redis) return;
  await redis.del(profileKey(username));
  await redis.del(profileByUsernameKey(username));
}

export async function getAllUserProfiles(): Promise<UserProfile[]> {
  const redis = getRedis();
  if (!redis) return [...memoryProfiles.values()];
  const keys = await redis.keys('match:profile-by-username:*');
  const items = await Promise.all(keys.map(k => redis.get<UserProfile>(k)));
  return items.filter((p): p is UserProfile => p !== null);
}

export async function markUserProfileDeleteRequested(username: string, requestedAt: string): Promise<void> {
  const redis = getRedis();
  const memory = [...memoryProfiles.values()].find(p => p.username === username);
  if (memory) {
    memoryProfiles.set(memory.profileId, { ...memory, deleteRequestedAt: requestedAt, updatedAt: requestedAt });
  }
  if (!redis) return;
  const current = await redis.get<UserProfile>(profileByUsernameKey(username));
  if (!current) return;
  const updated = { ...current, deleteRequestedAt: requestedAt, updatedAt: requestedAt };
  await redis.set(profileKey(current.profileId), updated);
  await redis.set(profileByUsernameKey(username), updated);
}

// ---------------------------------------------------------------------------
// 匹配反馈
// ---------------------------------------------------------------------------

export async function saveMatchFeedback(event: MatchFeedbackEvent): Promise<void> {
  const redis = getRedis();
  memoryFeedbackEvents.set(event.feedbackId, event);
  if (!redis) return;

  await redis.set(feedbackKey(event.feedbackId), event);
  await redis.lpush('match:feedback', event.feedbackId);
  if (event.needCaseId) {
    await redis.lpush(`match:feedback-by-needcase:${event.needCaseId}`, event.feedbackId);
  }
}

export async function getMatchFeedbackEvents(options?: { days?: number; limit?: number }): Promise<MatchFeedbackEvent[]> {
  const days = options?.days ?? 30;
  const limit = options?.limit ?? 500;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const redis = getRedis();

  if (!redis) {
    return [...memoryFeedbackEvents.values()]
      .filter(event => event.createdAt >= cutoff)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  const ids = await redis.lrange<string>('match:feedback', 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis.get<MatchFeedbackEvent>(feedbackKey(id))));
  return items.filter((event): event is MatchFeedbackEvent => event !== null && event.createdAt >= cutoff);
}

export async function getMatchFeedbackByNeedCase(needCaseId: string): Promise<MatchFeedbackEvent[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memoryFeedbackEvents.values()]
      .filter(e => e.needCaseId === needCaseId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  const ids = await redis.lrange<string>(`match:feedback-by-needcase:${needCaseId}`, 0, -1);
  const items = await Promise.all(ids.map(id => redis.get<MatchFeedbackEvent>(feedbackKey(id))));
  return items.filter((e): e is MatchFeedbackEvent => e !== null);
}

// ---------------------------------------------------------------------------
// 安全事件
// ---------------------------------------------------------------------------

export async function saveIncident(incident: Incident): Promise<void> {
  const redis = getRedis();
  memoryIncidents.set(incident.incidentId, incident);
  if (!redis) return;
  await redis.set(incidentKey(incident.incidentId), incident);
  if (!incident.resolved) {
    await redis.lpush('match:incidents:unresolved', incident.incidentId);
  }
}

export async function getUnresolvedIncidents(limit = 50): Promise<Incident[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memoryIncidents.values()]
      .filter(i => !i.resolved)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  const ids = await redis.lrange<string>('match:incidents:unresolved', 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis.get<Incident>(incidentKey(id))));
  return items.filter((i): i is Incident => i !== null && !i.resolved);
}

// ---------------------------------------------------------------------------
// 对话消息存储
// ---------------------------------------------------------------------------

export async function saveConversationMessages(sessionId: string, messages: ConversationMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const redis = getRedis();
  memoryMessages.set(sessionId, messages);
  if (!redis) return;

  const key = messagesKey(sessionId);
  await redis.del(key);
  for (const msg of messages) {
    await redis.rpush(key, msg);
  }
  await redis.expire(key, 30 * 86_400);
}

export async function getConversationMessages(sessionId: string): Promise<ConversationMessage[]> {
  const redis = getRedis();
  if (!redis) return memoryMessages.get(sessionId) ?? [];

  const messages = await redis.lrange<ConversationMessage>(messagesKey(sessionId), 0, -1);
  return messages.length > 0 ? messages : memoryMessages.get(sessionId) ?? [];
}

export async function getMultipleConversations(sessionIds: string[]): Promise<Array<{ sessionId: string; messages: ConversationMessage[] }>> {
  return Promise.all(
    sessionIds.map(async id => ({
      sessionId: id,
      messages: await getConversationMessages(id),
    })),
  );
}

// ---------------------------------------------------------------------------
// 公开统计计数
// ---------------------------------------------------------------------------

export async function incrementMatchStats(categories: NeedCategory[]): Promise<void> {
  const redis = getRedis();
  memoryMatchCount++;
  for (const cat of categories) {
    memoryCategoryCounts.set(cat, (memoryCategoryCounts.get(cat) ?? 0) + 1);
  }
  if (!redis) return;

  await redis.incr('match:stats:total');
  for (const cat of categories) {
    await redis.incr(`match:stats:category:${cat}`);
  }
}

// ---------------------------------------------------------------------------
// 搜索无结果记录（内容缺口信号，由 /api/search-events 写入）
// ---------------------------------------------------------------------------

export interface SearchMiss {
  query: string;
  count: number;
  lastSeen: string;
}

/** 读搜索无结果记录，按查询频率聚合（高频 = 内容缺口信号） */
export async function getSearchMisses(limit = 20): Promise<SearchMiss[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const raw = await redis.lrange<string>('search:misses', 0, 199);
    const counts = new Map<string, { count: number; lastSeen: number }>();
    for (const r of raw) {
      try {
        const item = JSON.parse(r) as { q?: string; t?: number };
        if (!item.q) continue;
        const existing = counts.get(item.q);
        const ts = item.t ?? Date.now();
        if (existing) {
          existing.count += 1;
          if (ts > existing.lastSeen) existing.lastSeen = ts;
        } else {
          counts.set(item.q, { count: 1, lastSeen: ts });
        }
      } catch { /* skip malformed */ }
    }
    return [...counts.entries()]
      .map(([query, v]) => ({ query, count: v.count, lastSeen: new Date(v.lastSeen).toISOString() }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 经验事件（U10 经验验证系统：原始事件采集 → 复盘 → 模式 → 方法成熟度）
// ---------------------------------------------------------------------------

function experienceKey(experienceId: string): string {
  return `match:experience:${experienceId}`;
}

export async function saveExperienceEvent(event: ExperienceEvent): Promise<void> {
  const redis = getRedis();
  memoryExperienceEvents.set(event.experienceId, event);
  if (!redis) return;
  await redis.set(experienceKey(event.experienceId), event);
  await redis.lpush('match:experiences:recent', event.experienceId);
  await redis.ltrim('match:experiences:recent', 0, 499);
}

export async function findRecentExperienceEvents(limit = 50): Promise<ExperienceEvent[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memoryExperienceEvents.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  try {
    const ids = await redis.lrange<string>('match:experiences:recent', 0, Math.max(0, limit - 1));
    const items = await Promise.all(ids.map(id => redis.get<ExperienceEvent>(experienceKey(id))));
    return items.filter((e): e is ExperienceEvent => e !== null);
  } catch {
    return [];
  }
}

export async function findExperienceEventById(experienceId: string): Promise<ExperienceEvent | null> {
  const redis = getRedis();
  const fromMemory = memoryExperienceEvents.get(experienceId);
  if (!redis) return fromMemory ?? null;
  try {
    return (await redis.get<ExperienceEvent>(experienceKey(experienceId))) ?? fromMemory ?? null;
  } catch {
    return fromMemory ?? null;
  }
}

export async function markExperiencePattern(experienceId: string, patternMarked: boolean): Promise<void> {
  const redis = getRedis();
  const existing = memoryExperienceEvents.get(experienceId);
  if (existing) {
    memoryExperienceEvents.set(experienceId, { ...existing, patternMarked, updatedAt: new Date().toISOString() });
  }
  if (!redis) return;
  try {
    const current = await redis.get<ExperienceEvent>(experienceKey(experienceId));
    if (current) {
      await redis.set(experienceKey(experienceId), { ...current, patternMarked, updatedAt: new Date().toISOString() });
    }
  } catch { /* 静默 */ }
}

/** 更新经验事件的复盘 / 模式标记 / 成熟度 / 反馈结果（admin 复盘用） */
export async function updateExperienceEvent(
  experienceId: string,
  patch: Partial<Pick<ExperienceEvent, 'reflection' | 'patternMarked' | 'maturity' | 'feedbackResult'>>,
): Promise<void> {
  const redis = getRedis();
  const existing = memoryExperienceEvents.get(experienceId);
  if (existing) {
    memoryExperienceEvents.set(experienceId, { ...existing, ...patch, updatedAt: new Date().toISOString() });
  }
  if (!redis) return;
  try {
    const current = await redis.get<ExperienceEvent>(experienceKey(experienceId));
    if (current) {
      await redis.set(experienceKey(experienceId), { ...current, ...patch, updatedAt: new Date().toISOString() });
    }
  } catch { /* 静默 */ }
}

// ---------------------------------------------------------------------------
// 规则候选（U9 规则候选池：observed → candidate → validated → stable → retired）
// ---------------------------------------------------------------------------

function ruleKey(ruleId: string): string {
  return `match:rule:${ruleId}`;
}

export async function saveRuleCandidate(rule: RuleCandidate): Promise<void> {
  const redis = getRedis();
  memoryRuleCandidates.set(rule.ruleId, rule);
  if (!redis) return;
  await redis.set(ruleKey(rule.ruleId), rule);
  await redis.lpush('match:rules:recent', rule.ruleId);
  await redis.ltrim('match:rules:recent', 0, 499);
}

export async function findRecentRuleCandidates(limit = 50): Promise<RuleCandidate[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memoryRuleCandidates.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  try {
    const ids = await redis.lrange<string>('match:rules:recent', 0, Math.max(0, limit - 1));
    const items = await Promise.all(ids.map(id => redis.get<RuleCandidate>(ruleKey(id))));
    return items.filter((r): r is RuleCandidate => r !== null);
  } catch {
    return [];
  }
}

export async function updateRuleStatus(ruleId: string, status: RuleCandidate['status'], note?: string): Promise<void> {
  const redis = getRedis();
  const existing = memoryRuleCandidates.get(ruleId);
  if (existing) {
    memoryRuleCandidates.set(ruleId, { ...existing, status, note: note ?? existing.note, updatedAt: new Date().toISOString() });
  }
  if (!redis) return;
  try {
    const current = await redis.get<RuleCandidate>(ruleKey(ruleId));
    if (current) {
      await redis.set(ruleKey(ruleId), { ...current, status, note: note ?? current.note, updatedAt: new Date().toISOString() });
    }
  } catch { /* 静默 */ }
}

// ---------------------------------------------------------------------------
// Skill 候选（U11 Skill 准入：candidate → admitted / demoted-to-method）
// ---------------------------------------------------------------------------

function skillKey(skillId: string): string {
  return `match:skill:${skillId}`;
}

export async function saveSkillCandidate(skill: SkillCandidate): Promise<void> {
  const redis = getRedis();
  memorySkillCandidates.set(skill.skillId, skill);
  if (!redis) return;
  await redis.set(skillKey(skill.skillId), skill);
  await redis.lpush('match:skills:recent', skill.skillId);
  await redis.ltrim('match:skills:recent', 0, 499);
}

export async function findRecentSkillCandidates(limit = 50): Promise<SkillCandidate[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memorySkillCandidates.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  try {
    const ids = await redis.lrange<string>('match:skills:recent', 0, Math.max(0, limit - 1));
    const items = await Promise.all(ids.map(id => redis.get<SkillCandidate>(skillKey(id))));
    return items.filter((s): s is SkillCandidate => s !== null);
  } catch {
    return [];
  }
}

export async function findSkillCandidatesByAdmission(status: SkillAdmissionStatus): Promise<SkillCandidate[]> {
  const all = await findRecentSkillCandidates(500);
  return all.filter(skill => skill.admissionStatus === status);
}

export async function updateSkillAdmission(skillId: string, admissionStatus: SkillAdmissionStatus): Promise<void> {
  const redis = getRedis();
  const existing = memorySkillCandidates.get(skillId);
  if (existing) {
    memorySkillCandidates.set(skillId, { ...existing, admissionStatus, updatedAt: new Date().toISOString() });
  }
  if (!redis) return;
  try {
    const current = await redis.get<SkillCandidate>(skillKey(skillId));
    if (current) {
      await redis.set(skillKey(skillId), { ...current, admissionStatus, updatedAt: new Date().toISOString() });
    }
  } catch { /* 静默 */ }
}

export interface PublicStats {
  matchCount: number;
  contentCount: number;
  topCategories: Array<{ id: string; label: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Need Case 统计聚合（取代旧 getDemandStats）
// ---------------------------------------------------------------------------

export interface NeedCaseStats {
  totalCases: number;
  totalSessions: number;
  byCategory: Record<string, number>;
  byFrictionLayer: Record<string, number>;
  byAbilityType: Record<string, number>;
  byFeedbackType: Record<string, number>;
  byReviewStatus: Record<string, number>;
  complianceRedirectRate: number;
  codeAgentMisuseRate: number;
  topNeeds: Array<{ summary: string; count: number }>;
  dailyTrend: Array<{ date: string; count: number }>;
}

/** 获取所有 TopicCandidate（按 priority 排序） */
export async function getTopicCandidates(options?: {
  status?: TopicCandidate['status'];
  limit?: number;
}): Promise<TopicCandidate[]> {
  const limit = options?.limit ?? 50;
  const redis = getRedis();

  let candidates: TopicCandidate[];

  if (redis) {
    const ids = await redis.lrange<string>('match:topics', 0, Math.max(0, limit - 1));
    const items = await Promise.all(ids.map(id => redis!.get<TopicCandidate>(topicKey(id))));
    candidates = items.filter((c): c is TopicCandidate => c !== null);
  } else {
    candidates = [...memoryTopicCandidates.values()];
  }

  if (options?.status) {
    candidates = candidates.filter(c => c.status === options.status);
  }

  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  candidates.sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));

  return candidates.slice(0, limit);
}

export async function getTopicCandidateById(topicId: string): Promise<TopicCandidate | null> {
  const redis = getRedis();
  const memory = memoryTopicCandidates.get(topicId) ?? null;
  if (!redis) return memory;
  return (await redis.get<TopicCandidate>(topicKey(topicId))) ?? memory;
}

export async function getTopicCandidateByClusterKey(clusterKey: string): Promise<TopicCandidate | null> {
  const candidates = await getTopicCandidates({ limit: 1000 });
  return candidates.find(candidate => candidate.clusterKey === clusterKey) ?? null;
}

export async function updateTopicCandidateStatus(
  topicId: string,
  status: TopicCandidate['status'],
  options?: { producedContentSlug?: string },
): Promise<TopicCandidate | null> {
  const current = await getTopicCandidateById(topicId);
  if (!current) return null;

  const updated: TopicCandidate = {
    ...current,
    status,
    ...(options?.producedContentSlug ? { producedContentSlug: options.producedContentSlug } : {}),
    updatedAt: new Date().toISOString(),
  };

  memoryTopicCandidates.set(topicId, updated);

  const redis = getRedis();
  if (redis) {
    await redis.set(topicKey(topicId), updated);
  }

  return updated;
}

/** Need Case 统计聚合 */
export async function getNeedCaseStats(options?: { days?: number }): Promise<NeedCaseStats> {
  const days = options?.days ?? 30;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const redis = getRedis();

  const cases = await getRecentNeedCases(2000);
  const recent = cases.filter(c => c.createdAt >= cutoff);

  const byCategory: Record<string, number> = {};
  const byFrictionLayer: Record<string, number> = {};
  const byAbilityType: Record<string, number> = {};
  const byFeedbackType: Record<string, number> = {};
  const byReviewStatus: Record<string, number> = {};
  let complianceRedirectCount = 0;
  let codeAgentMisuseCount = 0;
  const needCounts = new Map<string, number>();
  const dailyCounts = new Map<string, number>();

  for (const c of recent) {
    for (const cat of c.needCategories) {
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }
    if (c.frictionLayer) {
      byFrictionLayer[c.frictionLayer] = (byFrictionLayer[c.frictionLayer] ?? 0) + 1;
    }
    if (c.recommendedAbilityType) {
      byAbilityType[c.recommendedAbilityType] = (byAbilityType[c.recommendedAbilityType] ?? 0) + 1;
    }
    if (c.feedbackStatus && c.feedbackStatus !== 'none') {
      byFeedbackType[c.feedbackStatus] = (byFeedbackType[c.feedbackStatus] ?? 0) + 1;
    }
    byReviewStatus[c.adminReviewStatus] = (byReviewStatus[c.adminReviewStatus] ?? 0) + 1;
    if (c.safetyFlags.complianceRedirected) complianceRedirectCount++;
    if (c.safetyFlags.codeAgentMisuseLikely) codeAgentMisuseCount++;
    const summary = c.needSummary || '未分类需求';
    needCounts.set(summary, (needCounts.get(summary) ?? 0) + 1);
    const day = c.createdAt.slice(0, 10);
    dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
  }

  const feedbackEvents = await getMatchFeedbackEvents({ days });
  for (const event of feedbackEvents) {
    byFeedbackType[event.feedbackType] = (byFeedbackType[event.feedbackType] ?? 0) + 1;
  }

  const topNeeds = [...needCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([summary, count]) => ({ summary, count }));

  const dailyTrend = [...dailyCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  let totalSessions: number;
  if (redis) {
    const sessionIds = await redis.smembers('match:sessions');
    totalSessions = sessionIds.length;
  } else {
    totalSessions = memorySessions.size;
  }

  return {
    totalCases: recent.length,
    totalSessions,
    byCategory,
    byFrictionLayer,
    byAbilityType,
    byFeedbackType,
    byReviewStatus,
    complianceRedirectRate: recent.length > 0 ? complianceRedirectCount / recent.length : 0,
    codeAgentMisuseRate: recent.length > 0 ? codeAgentMisuseCount / recent.length : 0,
    topNeeds,
    dailyTrend,
  };
}

export async function saveTopicCandidates(candidates: TopicCandidate[]): Promise<void> {
  const redis = getRedis();
  for (const candidate of candidates) {
    const existedInMemory = memoryTopicCandidates.has(candidate.topicId);
    memoryTopicCandidates.set(candidate.topicId, candidate);
    if (redis) {
      const existedInRedis = Boolean(await redis.get<TopicCandidate>(topicKey(candidate.topicId)));
      await redis.set(topicKey(candidate.topicId), candidate);
      if (!existedInMemory && !existedInRedis) {
        await redis.lpush('match:topics', candidate.topicId);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// WorkItem —— 后台决策聚合根存储（P0-B / hai-razor 包 B）
//
// Key 约定：
//   match:workitem:{id}        单实体
//   match:workitems            全量索引列表（LPUSH id）
//   match:workitems:by-state:{status}   按状态索引列表（LPUSH id），便于按队列过滤
// 内存降级：开发期 memory-development；生产缺 Redis 时写操作由 service 层拒绝（503）。
// ---------------------------------------------------------------------------

function workItemKey(workItemId: string): string {
  return `match:workitem:${workItemId}`;
}

const WORKITEMS_LIST = 'match:workitems';
const WORKITEMS_ACTIVE_LIST = 'match:workitems:active';
const TERMINAL_STATUSES: WorkItemStatus[] = ['resolved', 'rejected'];

function workItemStateIndexKey(status: WorkItemStatus): string {
  return `match:workitems:by-state:${status}`;
}

/** 仅开发期测试用：清空内存 WorkItem，不触碰 Redis。 */
export function __resetMemoryWorkItems(): void {
  memoryWorkItems.clear();
}

export async function saveWorkItem(workItem: WorkItem): Promise<void> {
  memoryWorkItems.set(workItem.workItemId, workItem);
  const redis = getRedis();
  if (!redis) return;

  const existed = Boolean(await redis.get<WorkItem>(workItemKey(workItem.workItemId)));
  await redis.set(workItemKey(workItem.workItemId), workItem);
  if (!existed) {
    await redis.lpush(WORKITEMS_LIST, workItem.workItemId);
  }
  // 维护"活跃"列表：终态移出，非终态移入
  if (TERMINAL_STATUSES.includes(workItem.status)) {
    await redis.lrem(WORKITEMS_ACTIVE_LIST, 0, workItem.workItemId);
  } else if (!existed) {
    await redis.lpush(WORKITEMS_ACTIVE_LIST, workItem.workItemId);
  }
  // 状态索引（按 to 状态入，旧状态出 —— 仅在状态迁移时有用；这里基于"新状态"写入）
  await redis.lrem(workItemStateIndexKey(workItem.status), 0, workItem.workItemId);
  await redis.lpush(workItemStateIndexKey(workItem.status), workItem.workItemId);
}

export async function getWorkItemById(workItemId: string): Promise<WorkItem | null> {
  const redis = getRedis();
  const fromMemory = memoryWorkItems.get(workItemId) ?? null;
  if (!redis) return fromMemory;
  return (await redis.get<WorkItem>(workItemKey(workItemId))) ?? fromMemory;
}

export async function listWorkItems(options?: {
  queue?: WorkItem['queue'];
  status?: WorkItemStatus | WorkItemStatus[];
  limit?: number;
}): Promise<WorkItem[]> {
  const limit = options?.limit ?? 50;
  const redis = getRedis();

  let ids: string[];
  if (redis) {
    // 有状态过滤时优先用状态索引，减少全量扫描
    const statusFilter = options?.status
      ? (Array.isArray(options.status) ? options.status : [options.status])
      : null;
    ids = statusFilter && statusFilter.length === 1
      ? await redis.lrange<string>(workItemStateIndexKey(statusFilter[0]), 0, Math.max(0, limit - 1))
      : await redis.lrange<string>(WORKITEMS_LIST, 0, Math.max(0, limit - 1));
  } else {
    ids = [...memoryWorkItems.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map(item => item.workItemId);
  }

  const items = redis
    ? (await Promise.all(ids.map(id => redis!.get<WorkItem>(workItemKey(id)))))
        .filter((item): item is WorkItem => item !== null)
    : ids.map(id => memoryWorkItems.get(id)).filter((item): item is WorkItem => item !== null);

  const statusSet = options?.status
    ? new Set(Array.isArray(options.status) ? options.status : [options.status])
    : null;
  const filtered = items.filter(item => {
    if (options?.queue && item.queue !== options.queue) return false;
    if (statusSet && !statusSet.has(item.status)) return false;
    return true;
  });

  return filtered
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export async function listActiveWorkItems(options?: { limit?: number }): Promise<WorkItem[]> {
  const limit = options?.limit ?? 50;
  const redis = getRedis();

  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(WORKITEMS_ACTIVE_LIST, 0, Math.max(0, limit - 1));
  } else {
    ids = [...memoryWorkItems.values()]
      .filter(item => !TERMINAL_STATUSES.includes(item.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map(item => item.workItemId);
  }

  const items = redis
    ? (await Promise.all(ids.map(id => redis!.get<WorkItem>(workItemKey(id)))))
        .filter((item): item is WorkItem => item !== null)
    : ids.map(id => memoryWorkItems.get(id)).filter((item): item is WorkItem => item !== null);

  return items
    .filter(item => !TERMINAL_STATUSES.includes(item.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export async function deleteWorkItem(workItemId: string): Promise<void> {
  const existing = memoryWorkItems.get(workItemId);
  if (existing) {
    memoryWorkItems.delete(workItemId);
  }
  const redis = getRedis();
  if (!redis) return;
  await redis.del(workItemKey(workItemId));
  await redis.lrem(WORKITEMS_LIST, 0, workItemId);
  await redis.lrem(WORKITEMS_ACTIVE_LIST, 0, workItemId);
  // 状态索引无法精确知道旧状态，遍历可能的状态清理
  for (const status of [
    'proposal', 'pending', 'accepted', 'rejected', 'paused',
    'acting', 'awaiting-verification', 'resolved',
  ] as WorkItemStatus[]) {
    await redis.lrem(workItemStateIndexKey(status), 0, workItemId);
  }
}

// ---------------------------------------------------------------------------
// ContentFeedback —— 内容阅读反馈存储（P1-A）
//
// Key 约定：
//   content-feedback:event:{id}            单事件
//   content-feedback:recent                最近事件索引（LPUSH id + LTRIM 1000）
//   content-feedback:content:{contentId}   按内容索引
//   content-feedback:topic:{topicId}       按选题索引（sourceTopicId 派生）
// ---------------------------------------------------------------------------

function contentFeedbackKey(feedbackId: string): string {
  return `content-feedback:event:${feedbackId}`;
}
function contentFeedbackByContentKey(contentId: string): string {
  return `content-feedback:content:${contentId}`;
}
function contentFeedbackByTopicKey(topicId: string): string {
  return `content-feedback:topic:${topicId}`;
}
const CONTENT_FEEDBACK_RECENT = 'content-feedback:recent';

/** 仅开发期测试用：清空内存 ContentFeedback，不触碰 Redis。 */
export function __resetMemoryContentFeedback(): void {
  memoryContentFeedback.clear();
}

function inRange(event: ContentFeedbackEvent, range?: { from?: string; to?: string }): boolean {
  if (!range) return true;
  if (range.from && event.createdAt < range.from) return false;
  if (range.to && event.createdAt > range.to) return false;
  return true;
}

async function fetchByIds(ids: string[]): Promise<ContentFeedbackEvent[]> {
  const redis = getRedis();
  if (redis) {
    const items = await Promise.all(ids.map(id => redis!.get<ContentFeedbackEvent>(contentFeedbackKey(id))));
    return items.filter((e): e is ContentFeedbackEvent => e !== null);
  }
  return ids.map(id => memoryContentFeedback.get(id)).filter((e): e is ContentFeedbackEvent => e !== null);
}

export async function saveContentFeedback(event: ContentFeedbackEvent): Promise<void> {
  memoryContentFeedback.set(event.feedbackId, event);
  const redis = getRedis();
  if (!redis) return;
  await redis.set(contentFeedbackKey(event.feedbackId), event);
  await redis.lpush(CONTENT_FEEDBACK_RECENT, event.feedbackId);
  await redis.ltrim(CONTENT_FEEDBACK_RECENT, 0, 999);
  await redis.lpush(contentFeedbackByContentKey(event.contentId), event.feedbackId);
  if (event.sourceTopicId) {
    await redis.lpush(contentFeedbackByTopicKey(event.sourceTopicId), event.feedbackId);
  }
}

export async function findContentFeedbackByContent(
  contentId: string,
  range?: { from?: string; to?: string },
): Promise<ContentFeedbackEvent[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(contentFeedbackByContentKey(contentId), 0, 499);
  } else {
    ids = [...memoryContentFeedback.values()]
      .filter(e => e.contentId === contentId)
      .map(e => e.feedbackId);
  }
  const items = await fetchByIds(ids);
  return items.filter(e => e.contentId === contentId && inRange(e, range));
}

export async function findContentFeedbackByTopic(
  topicId: string,
  range?: { from?: string; to?: string },
): Promise<ContentFeedbackEvent[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(contentFeedbackByTopicKey(topicId), 0, 499);
  } else {
    ids = [...memoryContentFeedback.values()]
      .filter(e => e.sourceTopicId === topicId)
      .map(e => e.feedbackId);
  }
  const items = await fetchByIds(ids);
  return items.filter(e => e.sourceTopicId === topicId && inRange(e, range));
}

export async function findRecentContentFeedback(
  range?: { from?: string; to?: string },
  limit = 500,
): Promise<ContentFeedbackEvent[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(CONTENT_FEEDBACK_RECENT, 0, Math.max(0, limit - 1));
  } else {
    ids = [...memoryContentFeedback.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(e => e.feedbackId);
  }
  const items = await fetchByIds(ids);
  return items
    .filter(e => inRange(e, range))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
