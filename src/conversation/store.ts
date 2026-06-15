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
  InvitedSession,
  MatchFeedbackType,
  NeedCase,
  ProfileSnapshot,
  SafetyFlags,
  TopicCandidate,
  UserProfile,
} from '@/stores/ports';

import type {
  Incident,
  InvitedSession,
  MatchFeedbackEvent,
  MatchFeedbackType,
  NeedCase,
  TopicCandidate,
  UserProfile,
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

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// 内存降级存储
// ---------------------------------------------------------------------------

const memorySessions = new Map<string, MatchSession>();
const memoryNeedCases = new Map<string, NeedCase>();
const memoryFeedbackEvents = new Map<string, MatchFeedbackEvent>();
const memoryTopicCandidates = new Map<string, TopicCandidate>();
const memoryMessages = new Map<string, ConversationMessage[]>();
const memoryInvitedSessions = new Map<string, InvitedSession>();
const memoryProfiles = new Map<string, UserProfile>();
const memoryIncidents = new Map<string, Incident>();
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

function invitedSessionKey(sessionId: string): string {
  return `match:invited-session:${sessionId}`;
}

function profileKey(profileId: string): string {
  return `match:profile:${profileId}`;
}

function profileBySessionKey(sessionId: string): string {
  return `match:profile-by-session:${sessionId}`;
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

/** 用户请求删除画像时，关联脱敏该 session 的所有 NeedCase（清空原始需求 + 切片，保留聚合匿名） */
export async function redactNeedCasesBySession(sessionId: string): Promise<void> {
  const cases = await getNeedCasesBySession(sessionId);
  const now = new Date().toISOString();
  for (const c of cases) {
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
// 邀请会话
// ---------------------------------------------------------------------------

export async function saveInvitedSession(session: InvitedSession): Promise<void> {
  const redis = getRedis();
  memoryInvitedSessions.set(session.sessionId, session);
  if (!redis) return;
  const ttlSeconds = Math.max(60, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
  await redis.set(invitedSessionKey(session.sessionId), session, { ex: ttlSeconds });
}

export async function getInvitedSession(sessionId: string): Promise<InvitedSession | null> {
  const redis = getRedis();
  if (!redis) return memoryInvitedSessions.get(sessionId) ?? null;
  return (await redis.get<InvitedSession>(invitedSessionKey(sessionId))) ?? memoryInvitedSessions.get(sessionId) ?? null;
}

export async function isInvitedSessionValid(sessionId: string): Promise<boolean> {
  const session = await getInvitedSession(sessionId);
  if (!session) return false;
  if (session.authState !== 'invited') return false;
  return new Date(session.expiresAt).getTime() > Date.now();
}

export async function revokeInvitedSession(sessionId: string): Promise<void> {
  const redis = getRedis();
  memoryInvitedSessions.delete(sessionId);
  if (!redis) return;
  await redis.del(invitedSessionKey(sessionId));
}

// ---------------------------------------------------------------------------
// 用户画像
// ---------------------------------------------------------------------------

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const redis = getRedis();
  memoryProfiles.set(profile.profileId, profile);
  if (!redis) return;
  await redis.set(profileKey(profile.profileId), profile);
  await redis.set(profileBySessionKey(profile.sessionId), profile);
}

export async function getUserProfileBySession(sessionId: string): Promise<UserProfile | null> {
  const redis = getRedis();
  const fromMemory = [...memoryProfiles.values()].find(p => p.sessionId === sessionId) ?? null;
  if (!redis) return fromMemory;
  return (await redis.get<UserProfile>(profileBySessionKey(sessionId))) ?? fromMemory;
}

export async function getAllUserProfiles(): Promise<UserProfile[]> {
  const redis = getRedis();
  if (!redis) return [...memoryProfiles.values()];
  const keys = await redis.keys('match:profile-by-session:*');
  const items = await Promise.all(keys.map(k => redis.get<UserProfile>(k)));
  return items.filter((p): p is UserProfile => p !== null);
}

export async function markUserProfileDeleteRequested(sessionId: string, requestedAt: string): Promise<void> {
  const redis = getRedis();
  const memory = [...memoryProfiles.values()].find(p => p.sessionId === sessionId);
  if (memory) {
    memoryProfiles.set(memory.profileId, { ...memory, deleteRequestedAt: requestedAt, updatedAt: requestedAt });
  }
  if (!redis) return;
  const current = await redis.get<UserProfile>(profileBySessionKey(sessionId));
  if (!current) return;
  const updated = { ...current, deleteRequestedAt: requestedAt, updatedAt: requestedAt };
  await redis.set(profileKey(current.profileId), updated);
  await redis.set(profileBySessionKey(sessionId), updated);
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
