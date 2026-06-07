import { randomUUID } from 'node:crypto';

import { Redis } from '@upstash/redis';

import type { AiStage, AudienceGroup, FitVerdict, NeedCategory } from '@/profiles/resource-index';

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

export interface DemandEvent {
  eventId: string;
  sessionId: string;
  createdAt: string;
  rawNeedRedacted: string;
  needSummary: string;
  needCategories: NeedCategory[];
  fitVerdict?: FitVerdict;
  toolDirection?: string;
  codexMisuseLikely?: boolean;
  audienceGroup?: AudienceGroup;
  aiStage?: AiStage;
  isMinorContext: boolean;
  recommendedContentIds: string[];
  piiDetected: boolean;
  piiRemoved: boolean;
  status: 'pending' | 'processed' | 'ignored';
}

export interface TopicCandidate {
  topicId: string;
  createdAt: string;
  title: string;
  audience: string;
  coreQuestion: string;
  contentAngle: string;
  sourceNeedCount: number;
  relatedContentIds: string[];
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'accepted' | 'deferred' | 'ignored';
}

const memorySessions = new Map<string, MatchSession>();
const memoryEvents = new Map<string, DemandEvent>();
const memoryTopicCandidates = new Map<string, TopicCandidate>();

let cachedRedis: Redis | null | undefined;

function getRedis(): Redis | null {
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

function sessionKey(sessionId: string): string {
  return `match:session:${sessionId}`;
}

function eventKey(eventId: string): string {
  return `match:event:${eventId}`;
}

function topicKey(topicId: string): string {
  return `match:topic:${topicId}`;
}

export function createSessionId(): string {
  return randomUUID();
}

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

  const endedSession = {
    ...session,
    endedAt,
    lastActiveAt: endedAt,
  };
  await upsertMatchSession(endedSession);
  return endedSession;
}

export async function saveDemandEvent(event: DemandEvent): Promise<void> {
  const redis = getRedis();
  memoryEvents.set(event.eventId, event);
  if (!redis) return;

  await redis.set(eventKey(event.eventId), event);
  await redis.lpush('match:events:pending', event.eventId);
}

export async function getPendingDemandEvents(limit = 50): Promise<DemandEvent[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memoryEvents.values()]
      .filter(event => event.status === 'pending')
      .slice(0, limit);
  }

  const ids = await redis.lrange<string>('match:events:pending', 0, Math.max(0, limit - 1));
  const events = await Promise.all(ids.map(id => redis.get<DemandEvent>(eventKey(id))));
  return events.filter((event): event is DemandEvent => event !== null && event.status === 'pending');
}

export async function markDemandEventsProcessed(eventIds: string[]): Promise<void> {
  const redis = getRedis();
  for (const eventId of eventIds) {
    const current = memoryEvents.get(eventId);
    if (current) memoryEvents.set(eventId, { ...current, status: 'processed' });

    if (redis) {
      const event = await redis.get<DemandEvent>(eventKey(eventId));
      if (event) await redis.set(eventKey(eventId), { ...event, status: 'processed' });
      await redis.lrem('match:events:pending', 0, eventId);
    }
  }
}

// ---------------------------------------------------------------------------
// 洞察读取
// ---------------------------------------------------------------------------

export interface DemandStats {
  totalEvents: number;
  totalSessions: number;
  byCategory: Record<string, number>;
  byFitVerdict: Record<string, number>;
  codexMisuseRate: number;
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

/** 需求统计聚合 */
export async function getDemandStats(options?: { days?: number }): Promise<DemandStats> {
  const days = options?.days ?? 30;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const redis = getRedis();

  // 收集所有事件
  let events: DemandEvent[];
  if (redis) {
    // 扫描所有事件键
    const keys = await redis.keys('match:event:*');
    const items = await Promise.all(keys.map(key => redis!.get<DemandEvent>(key)));
    events = items.filter((e): e is DemandEvent => e !== null && e.createdAt >= cutoff);
  } else {
    events = [...memoryEvents.values()].filter(e => e.createdAt >= cutoff);
  }

  // 聚合
  const byCategory: Record<string, number> = {};
  const byFitVerdict: Record<string, number> = {};
  let codexMisuseCount = 0;
  const needCounts = new Map<string, number>();
  const dailyCounts = new Map<string, number>();

  for (const event of events) {
    // 分类计数
    for (const cat of event.needCategories) {
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }
    // 判断计数
    if (event.fitVerdict) {
      byFitVerdict[event.fitVerdict] = (byFitVerdict[event.fitVerdict] ?? 0) + 1;
    }
    // Codex 误用
    if (event.codexMisuseLikely) codexMisuseCount++;
    // 热门需求
    const summary = event.needSummary || '未分类需求';
    needCounts.set(summary, (needCounts.get(summary) ?? 0) + 1);
    // 日趋势
    const day = event.createdAt.slice(0, 10);
    dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
  }

  const topNeeds = [...needCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([summary, count]) => ({ summary, count }));

  const dailyTrend = [...dailyCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  // 会话数
  let totalSessions: number;
  if (redis) {
    const sessionIds = await redis.smembers('match:sessions');
    totalSessions = sessionIds.length;
  } else {
    totalSessions = memorySessions.size;
  }

  return {
    totalEvents: events.length,
    totalSessions,
    byCategory,
    byFitVerdict,
    codexMisuseRate: events.length > 0 ? codexMisuseCount / events.length : 0,
    topNeeds,
    dailyTrend,
  };
}

export async function saveTopicCandidates(candidates: TopicCandidate[]): Promise<void> {
  const redis = getRedis();
  for (const candidate of candidates) {
    memoryTopicCandidates.set(candidate.topicId, candidate);
    if (redis) {
      await redis.set(topicKey(candidate.topicId), candidate);
      await redis.lpush('match:topics', candidate.topicId);
    }
  }
}
