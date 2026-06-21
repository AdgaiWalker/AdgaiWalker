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
  ContentTelemetryEvent,
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
  AssetEvidenceLink,
  AssetKind,
  LearningRequest,
  LearningRequestStatus,
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
const memoryContentTelemetry = new Map<string, ContentTelemetryEvent>();
const memoryAssetEvidenceLinks = new Map<string, AssetEvidenceLink>();
const memoryLearningRequests = new Map<string, LearningRequest>();
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

/** 仅测试用：清空内存 SkillCandidate，不触碰 Redis。 */
export function __resetMemorySkillCandidates(): void {
  memorySkillCandidates.clear();
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

/** P4：按 ID 取单个 SkillCandidate（pause/rollback 用）。 */
export async function getSkillCandidateById(skillId: string): Promise<SkillCandidate | null> {
  const redis = getRedis();
  const fromMemory = memorySkillCandidates.get(skillId) ?? null;
  if (!redis) return fromMemory;
  try {
    return (await redis.get<SkillCandidate>(skillKey(skillId))) ?? fromMemory;
  } catch {
    return fromMemory;
  }
}

/**
 * P4：写入 Skill 注册护栏字段（边界/反例/验证集/注册层级）+ 准入状态 + 快照。
 * 由 AssetService.promote 在注册到 admitted 时调用。
 */
export async function updateSkillRegistration(
  skillId: string,
  fields: {
    admissionStatus: SkillAdmissionStatus;
    registrationTier?: import('@/stores/ports').SkillRegistrationTier;
    applicableBoundary?: string;
    failureBoundary?: string;
    positiveExamples?: string[];
    negativeExamples?: string[];
    evalSet?: import('@/stores/ports').SkillEvalCase[];
    snapshot: import('@/stores/ports').SkillAdmissionSnapshot;
  },
): Promise<void> {
  const redis = getRedis();
  const existing = memorySkillCandidates.get(skillId);
  if (existing) {
    memorySkillCandidates.set(skillId, {
      ...existing,
      admissionStatus: fields.admissionStatus,
      registrationTier: fields.registrationTier ?? existing.registrationTier,
      applicableBoundary: fields.applicableBoundary ?? existing.applicableBoundary,
      failureBoundary: fields.failureBoundary ?? existing.failureBoundary,
      positiveExamples: fields.positiveExamples ?? existing.positiveExamples,
      negativeExamples: fields.negativeExamples ?? existing.negativeExamples,
      evalSet: fields.evalSet ?? existing.evalSet,
      admissionSnapshots: [...(existing.admissionSnapshots ?? []), fields.snapshot],
      updatedAt: new Date().toISOString(),
    });
  }
  if (!redis) return;
  try {
    const current = await redis.get<SkillCandidate>(skillKey(skillId));
    if (current) {
      const merged: SkillCandidate = {
        ...current,
        admissionStatus: fields.admissionStatus,
        registrationTier: fields.registrationTier ?? current.registrationTier,
        applicableBoundary: fields.applicableBoundary ?? current.applicableBoundary,
        failureBoundary: fields.failureBoundary ?? current.failureBoundary,
        positiveExamples: fields.positiveExamples ?? current.positiveExamples,
        negativeExamples: fields.negativeExamples ?? current.negativeExamples,
        evalSet: fields.evalSet ?? current.evalSet,
        admissionSnapshots: [...(current.admissionSnapshots ?? []), fields.snapshot],
        updatedAt: new Date().toISOString(),
      };
      await redis.set(skillKey(skillId), merged);
    }
  } catch { /* 静默 */ }
}

/**
 * P4：暂停 / 恢复一个已注册 Skill（运行时开关，与 admissionStatus 正交）。
 * paused 的 admitted Skill 不被 Agent 调用（spec §28 受控注册：可暂停）。
 */
export async function setSkillPaused(
  skillId: string,
  paused: boolean,
  reason: string,
  snapshot?: import('@/stores/ports').SkillAdmissionSnapshot,
): Promise<void> {
  const redis = getRedis();
  const ts = new Date().toISOString();
  const existing = memorySkillCandidates.get(skillId);
  if (existing) {
    memorySkillCandidates.set(skillId, {
      ...existing,
      paused,
      pausedReason: paused ? reason : undefined,
      pausedAt: paused ? ts : undefined,
      admissionSnapshots: snapshot ? [...(existing.admissionSnapshots ?? []), snapshot] : existing.admissionSnapshots,
      updatedAt: ts,
    });
  }
  if (!redis) return;
  try {
    const current = await redis.get<SkillCandidate>(skillKey(skillId));
    if (current) {
      const merged: SkillCandidate = {
        ...current,
        paused,
        pausedReason: paused ? reason : undefined,
        pausedAt: paused ? ts : undefined,
        admissionSnapshots: snapshot ? [...(current.admissionSnapshots ?? []), snapshot] : current.admissionSnapshots,
        updatedAt: ts,
      };
      await redis.set(skillKey(skillId), merged);
    }
  } catch { /* 静默 */ }
}

/**
 * P4：从一个准入快照回滚 Skill 的 admission 状态（spec §28 可回滚）。
 * 只恢复 admission 相关字段（status/tier/paused），不动 boundary/evalSet 本体。
 * 调用方负责按 toVersion 选出快照后传入。
 */
export async function rollbackSkillAdmission(
  skillId: string,
  snapshot: import('@/stores/ports').SkillAdmissionSnapshot,
): Promise<void> {
  const redis = getRedis();
  const ts = new Date().toISOString();
  const apply = (s: SkillCandidate): SkillCandidate => ({
    ...s,
    admissionStatus: snapshot.admissionStatus,
    registrationTier: snapshot.registrationTier ?? s.registrationTier,
    paused: snapshot.paused ?? false,
    pausedReason: snapshot.paused ? (s.pausedReason ?? '回滚恢复') : undefined,
    pausedAt: snapshot.paused ? (s.pausedAt ?? ts) : undefined,
    admissionSnapshots: [...(s.admissionSnapshots ?? []), snapshot],
    updatedAt: ts,
  });
  const existing = memorySkillCandidates.get(skillId);
  if (existing) memorySkillCandidates.set(skillId, apply(existing));
  if (!redis) return;
  try {
    const current = await redis.get<SkillCandidate>(skillKey(skillId));
    if (current) await redis.set(skillKey(skillId), apply(current));
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

/**
 * 生产等价存储验证（scripts/verify-production-storage.mjs）需要与这里使用完全一致的键名，
 * 否则会写到 app 永远不读的命名空间而"假通过"。这里导出键名真相源，供对账测试锁定一致性。
 */
export const WORKITEM_REDIS_KEYS = {
  workItem: workItemKey,
  list: WORKITEMS_LIST,
  activeList: WORKITEMS_ACTIVE_LIST,
} as const;

function workItemStateIndexKey(status: WorkItemStatus): string {
  return `match:workitems:by-state:${status}`;
}

/** 仅开发期测试用：清空内存 WorkItem，不触碰 Redis。 */
export function __resetMemoryWorkItems(): void {
  memoryWorkItems.clear();
}

/**
 * 仅测试用：注入 FakeRedis（或 null）覆盖 getRedis() 的缓存，使 saveWorkItem /
 * listWorkItems 的 Redis 索引维护逻辑可在无真实 Redis 的测试环境被覆盖。
 * 传入 undefined 复位为"未缓存，下次按 env 解析"。
 */
export function __setCachedRedisForTesting(redis: unknown): void {
  cachedRedis = (redis as Redis | null) ?? undefined;
}

/** 仅开发演示场景用：清理指定前缀的内存 WorkItem，不触碰真实 Redis。 */
export function __deleteMemoryWorkItemsByPrefix(prefix: string): number {
  let deleted = 0;
  for (const id of [...memoryWorkItems.keys()]) {
    if (id.startsWith(prefix)) {
      memoryWorkItems.delete(id);
      deleted += 1;
    }
  }
  return deleted;
}

/** 仅开发演示场景用：清理标题带指定前缀的内存 WorkItem，不触碰真实 Redis。 */
export function __deleteMemoryWorkItemsByTitlePrefix(prefix: string): number {
  let deleted = 0;
  for (const [id, item] of [...memoryWorkItems.entries()]) {
    if (item.title.startsWith(prefix)) {
      memoryWorkItems.delete(id);
      deleted += 1;
    }
  }
  return deleted;
}

export async function saveWorkItem(workItem: WorkItem): Promise<void> {
  memoryWorkItems.set(workItem.workItemId, workItem);
  const redis = getRedis();
  if (!redis) return;

  // previous 必须在事务外读取（Upstash MULTI 不支持事务内读用于分支判断）。
  const previous = await redis.get<WorkItem>(workItemKey(workItem.workItemId));

  // P0-B02：实体写入与所有索引维护放进单个 MULTI/EXEC 原子事务。
  // 此前是顺序 await 单命令，set 写完后若 lpush 前进程崩溃或某条 HTTP 失败，
  // 会留下"实体已更新但索引未更新"的不一致——listWorkItems 读到旧状态索引。
  // MULTI 保证写阶段原子：要么全部生效，要么全部不生效。
  // 事务内仍保留"先 lrem 再 lpush"的幂等命令顺序作为 defense-in-depth，
  // 即便将来误用非原子 pipeline 也不会产生脏索引。
  const tx = redis.multi();
  tx.set(workItemKey(workItem.workItemId), workItem);
  if (!previous) {
    tx.lpush(WORKITEMS_LIST, workItem.workItemId);
  }
  // 维护"活跃"列表：终态移出，非终态移入
  if (TERMINAL_STATUSES.includes(workItem.status)) {
    tx.lrem(WORKITEMS_ACTIVE_LIST, 0, workItem.workItemId);
  } else if (!previous) {
    tx.lpush(WORKITEMS_ACTIVE_LIST, workItem.workItemId);
  }
  // 状态索引：状态迁移时必须从旧状态索引移除，否则已迁移 WorkItem 残留在旧索引，
  // listWorkItems({status}) 单状态过滤在脏条目超过 limit 时会读到全脏 id、被 re-filter 清空，
  // 返回错误空列表。此处先按 from→to 清旧，再写新（去重 + 保证在列）。
  if (previous && previous.status !== workItem.status) {
    tx.lrem(workItemStateIndexKey(previous.status), 0, workItem.workItemId);
  }
  tx.lrem(workItemStateIndexKey(workItem.status), 0, workItem.workItemId);
  tx.lpush(workItemStateIndexKey(workItem.status), workItem.workItemId);
  await tx.exec();
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

/**
 * 生产等价存储验证（scripts/verify-production-storage.mjs）键名真相源。
 * 注意 ContentFeedback 键没有 `match:` 前缀，与 WorkItem 不同。
 */
export const CONTENT_FEEDBACK_REDIS_KEYS = {
  event: contentFeedbackKey,
  recent: CONTENT_FEEDBACK_RECENT,
  byContent: contentFeedbackByContentKey,
} as const;

/** 仅开发期测试用：清空内存 ContentFeedback，不触碰 Redis。 */
export function __resetMemoryContentFeedback(): void {
  memoryContentFeedback.clear();
}

/** 仅开发演示场景用：清理指定前缀的内存 ContentFeedback，不触碰真实 Redis。 */
export function __deleteMemoryContentFeedbackByPrefix(prefix: string): number {
  let deleted = 0;
  for (const id of [...memoryContentFeedback.keys()]) {
    if (id.startsWith(prefix)) {
      memoryContentFeedback.delete(id);
      deleted += 1;
    }
  }
  return deleted;
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

// ---------------------------------------------------------------------------
// ContentTelemetry —— 内容阅读深度遥测存储（P3-A）
//
// 与 ContentFeedback 分开存储/计算（不合并分母）。支持真实决策：
// "哪篇内容读者读到哪 / 是否读完 → 优先改进哪篇"。
//
// Key 约定（无 `match:` 前缀，与 ContentFeedback 同族）：
//   telemetry:event:{eventId}            单条事件
//   telemetry:recent                     最近事件索引（LPUSH id + LTRIM 2000）
//   telemetry:content:{contentId}        按内容索引（供 hit-rate readingOutcome 消费）
// ---------------------------------------------------------------------------

function contentTelemetryKey(eventId: string): string {
  return `telemetry:event:${eventId}`;
}
function contentTelemetryByContentKey(contentId: string): string {
  return `telemetry:content:${contentId}`;
}
const CONTENT_TELEMETRY_RECENT = 'telemetry:recent';

/**
 * 生产等价存储验证键名真相源（与 WORKITEM_REDIS_KEYS / CONTENT_FEEDBACK_REDIS_KEYS 同模式）。
 */
export const CONTENT_TELEMETRY_REDIS_KEYS = {
  event: contentTelemetryKey,
  recent: CONTENT_TELEMETRY_RECENT,
  byContent: contentTelemetryByContentKey,
} as const;

// ---------------------------------------------------------------------------
// P4 Contributor 对象级授权 + 操作审计存储（spec §29）
//
// Key 约定：
//   object-grant:{grantId}                单条授权
//   object-grant:by-grantee:{username}    某用户的所有授权（按 resourceType 可再过滤）
//   action-audit:recent                   最近审计（LPUSH + LTRIM）
// ---------------------------------------------------------------------------

const memoryObjectGrants = new Map<string, import('@/stores/ports').ObjectGrant>();
const memoryActionAudit = new Map<string, import('@/stores/ports').ActionAuditEntry>();
const memoryNorthStarOrders = new Map<string, import('@/stores/ports').Order>();
const memoryNorthStarPaymentIntents = new Map<string, import('@/stores/ports').PaymentIntent>();
const memoryNorthStarRefunds = new Map<string, import('@/stores/ports').RefundRecord>();
const memoryNorthStarOffers = new Map<string, import('@/stores/ports').NorthStarOffer>();

function objectGrantKey(grantId: string): string {
  return `object-grant:${grantId}`;
}
function objectGrantByGranteeKey(username: string): string {
  return `object-grant:by-grantee:${username}`;
}
const ACTION_AUDIT_RECENT = 'action-audit:recent';

/** 仅测试用：清空内存授权与审计。 */
export function __resetMemoryObjectGrants(): void {
  memoryObjectGrants.clear();
  memoryActionAudit.clear();
}

export async function saveObjectGrant(grant: import('@/stores/ports').ObjectGrant): Promise<void> {
  memoryObjectGrants.set(grant.grantId, grant);
  const redis = getRedis();
  if (!redis) return;
  const tx = redis.multi();
  tx.set(objectGrantKey(grant.grantId), grant);
  tx.lpush(objectGrantByGranteeKey(grant.grantee), grant.grantId);
  tx.lpush('object-grant:recent', grant.grantId);
  tx.ltrim('object-grant:recent', 0, 499);
  await tx.exec();
}

/** 列出全部 grant（按时间倒序，admin 管理面用；不分类）。 */
export async function findAllObjectGrants(limit = 200): Promise<import('@/stores/ports').ObjectGrant[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memoryObjectGrants.values()]
      .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))
      .slice(0, limit);
  }
  // 无全局索引；遍历 by-grantee 集合不可行（未维护用户集合）。退化为内存读 + Redis 全 scan 的并集。
  // grant 量小（单作者系统），可接受。用内存兜底保证 dev 一致；生产 Redis 路径按 grantId 遍历需索引，
  // 当前用一个 recent 列表索引（saveObjectGrant 时维护）。
  const ids = await redis.lrange<string>('object-grant:recent', 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis!.get<import('@/stores/ports').ObjectGrant>(objectGrantKey(id))));
  return items.filter((g): g is import('@/stores/ports').ObjectGrant => g !== null)
    .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
}

export async function findObjectGrantsByGrantee(
  username: string,
  resourceType?: string,
): Promise<import('@/stores/ports').ObjectGrant[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(objectGrantByGranteeKey(username), 0, 199);
  } else {
    ids = [...memoryObjectGrants.values()].filter(g => g.grantee === username).map(g => g.grantId);
  }
  const fetch = redis
    ? (await Promise.all(ids.map(id => redis!.get<import('@/stores/ports').ObjectGrant>(objectGrantKey(id)))))
        .filter((g): g is import('@/stores/ports').ObjectGrant => g !== null)
    : ids.map(id => memoryObjectGrants.get(id)).filter((g): g is import('@/stores/ports').ObjectGrant => Boolean(g));
  return fetch.filter(g => g.grantee === username && (!resourceType || g.resourceType === resourceType));
}

export async function revokeObjectGrant(grantId: string): Promise<void> {
  const existing = memoryObjectGrants.get(grantId);
  memoryObjectGrants.delete(grantId);
  const redis = getRedis();
  if (!redis) return;
  const current = await redis.get<import('@/stores/ports').ObjectGrant>(objectGrantKey(grantId));
  const tx = redis.multi();
  tx.del(objectGrantKey(grantId));
  if (current ?? existing) {
    tx.lrem(objectGrantByGranteeKey((current ?? existing)!.grantee), 0, grantId);
  }
  await tx.exec();
}

export async function saveActionAudit(entry: import('@/stores/ports').ActionAuditEntry): Promise<void> {
  memoryActionAudit.set(entry.auditId, entry);
  const redis = getRedis();
  if (!redis) return;
  const tx = redis.multi();
  tx.set(`action-audit:${entry.auditId}`, entry);
  tx.lpush(ACTION_AUDIT_RECENT, entry.auditId);
  tx.ltrim(ACTION_AUDIT_RECENT, 0, 999);
  await tx.exec();
}

export async function findRecentActionAudit(limit = 100): Promise<import('@/stores/ports').ActionAuditEntry[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(ACTION_AUDIT_RECENT, 0, Math.max(0, limit - 1));
  } else {
    ids = [...memoryActionAudit.values()]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit)
      .map(e => e.auditId);
  }
  if (redis) {
    const items = await Promise.all(ids.map(id => redis!.get<import('@/stores/ports').ActionAuditEntry>(`action-audit:${id}`)));
    return items.filter((e): e is import('@/stores/ports').ActionAuditEntry => e !== null)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }
  return ids.map(id => memoryActionAudit.get(id)).filter((e): e is import('@/stores/ports').ActionAuditEntry => Boolean(e))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

// ---------------------------------------------------------------------------
// P5 NorthStar 订单 / 支付意图 / 退款存储（spec §14）
//
// Key 约定：
//   northstar:order:{orderId}            单个订单
//   northstar:payment-intent:{piId}      单个支付意图
//   northstar:refund:{refundId}          单个退款
//   northstar:orders:recent              最近订单索引（LPUSH + LTRIM）
// 注意：NorthStar 默认 OFF；这些键只在 isNorthStarEnabled() 时由 service 写入。
// ---------------------------------------------------------------------------

function northstarOrderKey(orderId: string): string {
  return `northstar:order:${orderId}`;
}
function northstarPaymentIntentKey(piId: string): string {
  return `northstar:payment-intent:${piId}`;
}
function northstarRefundKey(refundId: string): string {
  return `northstar:refund:${refundId}`;
}
const NORTHSTAR_ORDERS_RECENT = 'northstar:orders:recent';

/** 仅测试用：清空内存 NorthStar 订单/支付/退款。 */
export function __resetMemoryNorthStar(): void {
  memoryNorthStarOrders.clear();
  memoryNorthStarPaymentIntents.clear();
  memoryNorthStarRefunds.clear();
  memoryNorthStarOffers.clear();
}

function northstarOfferKey(offerId: string): string {
  return `northstar:offer:${offerId}`;
}
const NORTHSTAR_OFFERS_RECENT = 'northstar:offers:recent';

export async function saveNorthStarOffer(offer: import('@/stores/ports').NorthStarOffer): Promise<void> {
  memoryNorthStarOffers.set(offer.offerId, offer);
  const redis = getRedis();
  if (!redis) return;
  const tx = redis.multi();
  tx.set(northstarOfferKey(offer.offerId), offer);
  tx.lpush(NORTHSTAR_OFFERS_RECENT, offer.offerId);
  tx.ltrim(NORTHSTAR_OFFERS_RECENT, 0, 199);
  await tx.exec();
}

export async function findNorthStarOffer(offerId: string): Promise<import('@/stores/ports').NorthStarOffer | null> {
  const redis = getRedis();
  const fromMemory = memoryNorthStarOffers.get(offerId) ?? null;
  if (!redis) return fromMemory;
  try {
    return (await redis.get<import('@/stores/ports').NorthStarOffer>(northstarOfferKey(offerId))) ?? fromMemory;
  } catch { return fromMemory; }
}

export async function findAllNorthStarOffers(limit = 200): Promise<import('@/stores/ports').NorthStarOffer[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memoryNorthStarOffers.values()]
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, limit);
  }
  const ids = await redis.lrange<string>(NORTHSTAR_OFFERS_RECENT, 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis!.get<import('@/stores/ports').NorthStarOffer>(northstarOfferKey(id))));
  return items.filter((o): o is import('@/stores/ports').NorthStarOffer => o !== null)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export async function findRecentNorthStarOrders(limit = 100): Promise<import('@/stores/ports').Order[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memoryNorthStarOrders.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }
  const ids = await redis.lrange<string>(NORTHSTAR_ORDERS_RECENT, 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis!.get<import('@/stores/ports').Order>(northstarOrderKey(id))));
  return items.filter((o): o is import('@/stores/ports').Order => o !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveNorthStarOrder(order: import('@/stores/ports').Order): Promise<void> {
  memoryNorthStarOrders.set(order.orderId, order);
  const redis = getRedis();
  if (!redis) return;
  const tx = redis.multi();
  tx.set(northstarOrderKey(order.orderId), order);
  tx.lpush(NORTHSTAR_ORDERS_RECENT, order.orderId);
  tx.ltrim(NORTHSTAR_ORDERS_RECENT, 0, 499);
  await tx.exec();
}

export async function findNorthStarOrder(orderId: string): Promise<import('@/stores/ports').Order | null> {
  const redis = getRedis();
  const fromMemory = memoryNorthStarOrders.get(orderId) ?? null;
  if (!redis) return fromMemory;
  try {
    return (await redis.get<import('@/stores/ports').Order>(northstarOrderKey(orderId))) ?? fromMemory;
  } catch {
    return fromMemory;
  }
}

export async function saveNorthStarPaymentIntent(intent: import('@/stores/ports').PaymentIntent): Promise<void> {
  memoryNorthStarPaymentIntents.set(intent.paymentIntentId, intent);
  const redis = getRedis();
  if (!redis) return;
  await redis.set(northstarPaymentIntentKey(intent.paymentIntentId), intent);
}

export async function findNorthStarPaymentIntent(piId: string): Promise<import('@/stores/ports').PaymentIntent | null> {
  const redis = getRedis();
  const fromMemory = memoryNorthStarPaymentIntents.get(piId) ?? null;
  if (!redis) return fromMemory;
  try {
    return (await redis.get<import('@/stores/ports').PaymentIntent>(northstarPaymentIntentKey(piId))) ?? fromMemory;
  } catch {
    return fromMemory;
  }
}

export async function saveNorthStarRefund(refund: import('@/stores/ports').RefundRecord): Promise<void> {
  memoryNorthStarRefunds.set(refund.refundId, refund);
  const redis = getRedis();
  if (!redis) return;
  await redis.set(northstarRefundKey(refund.refundId), refund);
}

/** 仅测试用：清空内存 ContentTelemetry，不触碰 Redis。 */
export function __resetMemoryContentTelemetry(): void {
  memoryContentTelemetry.clear();
}

function telemetryInRange(event: ContentTelemetryEvent, range?: { from?: string; to?: string }): boolean {
  if (!range) return true;
  if (range.from && event.createdAt < range.from) return false;
  if (range.to && event.createdAt > range.to) return false;
  return true;
}

async function fetchTelemetryByIds(ids: string[]): Promise<ContentTelemetryEvent[]> {
  const redis = getRedis();
  if (redis) {
    const items = await Promise.all(ids.map(id => redis!.get<ContentTelemetryEvent>(contentTelemetryKey(id))));
    return items.filter((e): e is ContentTelemetryEvent => e !== null);
  }
  return ids.map(id => memoryContentTelemetry.get(id)).filter((e): e is ContentTelemetryEvent => e !== null);
}

export async function saveContentTelemetry(event: ContentTelemetryEvent): Promise<void> {
  memoryContentTelemetry.set(event.eventId, event);
  const redis = getRedis();
  if (!redis) return;
  // P0-B02 同款 MULTI 原子事务：实体 + recent 索引 + by-content 索引一起提交，
  // 避免 set 后 lpush 前失败留下"实体已写但索引丢"的不一致。
  const tx = redis.multi();
  tx.set(contentTelemetryKey(event.eventId), event);
  tx.lpush(CONTENT_TELEMETRY_RECENT, event.eventId);
  tx.ltrim(CONTENT_TELEMETRY_RECENT, 0, 1999);
  tx.lpush(contentTelemetryByContentKey(event.contentId), event.eventId);
  await tx.exec();
}

export async function findContentTelemetryByContent(
  contentId: string,
  range?: { from?: string; to?: string },
): Promise<ContentTelemetryEvent[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(contentTelemetryByContentKey(contentId), 0, 999);
  } else {
    ids = [...memoryContentTelemetry.values()]
      .filter(e => e.contentId === contentId)
      .map(e => e.eventId);
  }
  const items = await fetchTelemetryByIds(ids);
  return items.filter(e => e.contentId === contentId && telemetryInRange(e, range));
}

export async function findRecentContentTelemetry(
  range?: { from?: string; to?: string },
  limit = 2000,
): Promise<ContentTelemetryEvent[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(CONTENT_TELEMETRY_RECENT, 0, Math.max(0, limit - 1));
  } else {
    ids = [...memoryContentTelemetry.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(e => e.eventId);
  }
  const items = await fetchTelemetryByIds(ids);
  return items
    .filter(e => telemetryInRange(e, range))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// AssetEvidenceLink —— 资产晋升证据链存储（P2-B）
//
// Key 约定：
//   asset-link:event:{id}               单条晋升记录
//   asset-link:by-asset:{kind}:{assetId}  某资产的所有晋升记录（按时间倒序）
//   asset-link:recent                    最近晋升记录索引
// ---------------------------------------------------------------------------

function assetLinkKey(linkId: string): string {
  return `asset-link:event:${linkId}`;
}
function assetLinkByAssetKey(kind: AssetKind, assetId: string): string {
  return `asset-link:by-asset:${kind}:${assetId}`;
}
const ASSET_LINK_RECENT = 'asset-link:recent';

/** 仅测试用：清空内存 AssetEvidenceLink */
export function __resetMemoryAssetLinks(): void {
  memoryAssetEvidenceLinks.clear();
}

export async function saveAssetEvidenceLink(link: AssetEvidenceLink): Promise<void> {
  memoryAssetEvidenceLinks.set(link.linkId, link);
  const redis = getRedis();
  if (!redis) return;
  await redis.set(assetLinkKey(link.linkId), link);
  await redis.lpush(assetLinkByAssetKey(link.assetKind, link.assetId), link.linkId);
  await redis.lpush(ASSET_LINK_RECENT, link.linkId);
  await redis.ltrim(ASSET_LINK_RECENT, 0, 499);
}

export async function findAssetEvidenceLinks(kind: AssetKind, assetId: string): Promise<AssetEvidenceLink[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(assetLinkByAssetKey(kind, assetId), 0, 99);
  } else {
    ids = [...memoryAssetEvidenceLinks.values()]
      .filter(l => l.assetKind === kind && l.assetId === assetId)
      .map(l => l.linkId);
  }
  const links = redis
    ? (await Promise.all(ids.map(id => redis!.get<AssetEvidenceLink>(assetLinkKey(id)))))
        .filter((l): l is AssetEvidenceLink => l !== null)
    : ids.map(id => memoryAssetEvidenceLinks.get(id)).filter((l): l is AssetEvidenceLink => Boolean(l));
  return links
    .filter(l => l.assetKind === kind && l.assetId === assetId)
    .sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0) || b.approvedAt.localeCompare(a.approvedAt));
}

export async function findRecentAssetEvidenceLinks(limit = 100): Promise<AssetEvidenceLink[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(ASSET_LINK_RECENT, 0, Math.max(0, limit - 1));
  } else {
    ids = [...memoryAssetEvidenceLinks.values()]
      .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt))
      .slice(0, limit)
      .map(l => l.linkId);
  }
  const links = redis
    ? (await Promise.all(ids.map(id => redis!.get<AssetEvidenceLink>(assetLinkKey(id)))))
        .filter((l): l is AssetEvidenceLink => l !== null)
    : ids.map(id => memoryAssetEvidenceLinks.get(id)).filter((l): l is AssetEvidenceLink => Boolean(l));
  return links.sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0) || b.approvedAt.localeCompare(a.approvedAt));
}

// ---------------------------------------------------------------------------
// LearningRequest —— 证据不足补证任务存储（P2-B）
//
// Key 约定：
//   learning-request:{id}            单条
//   learning-request:by-status:{status}  按状态索引
//   learning-request:recent          最近索引
// ---------------------------------------------------------------------------

function learningRequestKey(requestId: string): string {
  return `learning-request:${requestId}`;
}
function learningRequestByStatusKey(status: LearningRequestStatus): string {
  return `learning-request:by-status:${status}`;
}
const LEARNING_REQUEST_RECENT = 'learning-request:recent';

/** 仅测试用：清空内存 LearningRequest */
export function __resetMemoryLearningRequests(): void {
  memoryLearningRequests.clear();
}

export async function saveLearningRequest(request: LearningRequest): Promise<void> {
  memoryLearningRequests.set(request.requestId, request);
  const redis = getRedis();
  if (!redis) return;

  // previous 在事务外读取（Upstash MULTI 不支持事务内读用于分支判断）。
  const previous = await redis.get<LearningRequest>(learningRequestKey(request.requestId));

  // P0-B02：实体 + 索引写入放进单个 MULTI/EXEC 原子事务（与 saveWorkItem 同策略）。
  // 同时修复此前的确定性脏索引 bug：状态迁移时未从旧 by-status 索引移除，
  // 与第十四轮前的 saveWorkItem 同形——findLearningRequestsByStatus 单状态过滤
  // 在脏条目超过 lrange 上限时会读到全脏 id、被 re-filter 清空，返回错误空列表。
  const tx = redis.multi();
  tx.set(learningRequestKey(request.requestId), request);
  if (previous && previous.status !== request.status) {
    tx.lrem(learningRequestByStatusKey(previous.status), 0, request.requestId);
  }
  tx.lrem(learningRequestByStatusKey(request.status), 0, request.requestId);
  tx.lpush(learningRequestByStatusKey(request.status), request.requestId);
  tx.lpush(LEARNING_REQUEST_RECENT, request.requestId);
  tx.ltrim(LEARNING_REQUEST_RECENT, 0, 499);
  await tx.exec();
}

export async function getLearningRequestById(requestId: string): Promise<LearningRequest | null> {
  const redis = getRedis();
  const fromMemory = memoryLearningRequests.get(requestId) ?? null;
  if (!redis) return fromMemory;
  return (await redis.get<LearningRequest>(learningRequestKey(requestId))) ?? fromMemory;
}

export async function findLearningRequestsByStatus(status: LearningRequestStatus): Promise<LearningRequest[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(learningRequestByStatusKey(status), 0, 199);
  } else {
    ids = [...memoryLearningRequests.values()].filter(r => r.status === status).map(r => r.requestId);
  }
  const items = redis
    ? (await Promise.all(ids.map(id => redis!.get<LearningRequest>(learningRequestKey(id)))))
        .filter((r): r is LearningRequest => r !== null)
    : ids.map(id => memoryLearningRequests.get(id)).filter((r): r is LearningRequest => Boolean(r));
  return items.filter(r => r.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findRecentLearningRequests(limit = 100): Promise<LearningRequest[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(LEARNING_REQUEST_RECENT, 0, Math.max(0, limit - 1));
  } else {
    ids = [...memoryLearningRequests.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(r => r.requestId);
  }
  const items = redis
    ? (await Promise.all(ids.map(id => redis!.get<LearningRequest>(learningRequestKey(id)))))
        .filter((r): r is LearningRequest => r !== null)
    : ids.map(id => memoryLearningRequests.get(id)).filter((r): r is LearningRequest => Boolean(r));
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
