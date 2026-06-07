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
