/**
 * 匹配会话 Store — 实现 MatchSessionRepositoryPort
 *
 * 匹配会话域的存储逻辑（会话 CRUD、对话消息、统计计数）。
 * Redis 不可用时降级到内存。
 */
import { randomUUID } from 'node:crypto';

import { getRedis } from '@/stores/redis-client';

import type {
  ConversationMessage,
  MatchSessionRepositoryPort,
} from './ports';
import type { AudienceGroup, AiStage, NeedCategory } from '@/profiles/resource-index';

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
const memoryMessages = new Map<string, ConversationMessage[]>();
let memoryMatchCount = 0;
const memoryCategoryCounts = new Map<string, number>();

export function createSessionId(): string {
  return randomUUID();
}

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

function sessionKey(sessionId: string): string {
  return `match:session:${sessionId}`;
}

function messagesKey(sessionId: string): string {
  return `match:messages:${sessionId}`;
}

// ---------------------------------------------------------------------------
// 匹配会话 CRUD
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
// MatchSessionRepositoryPort 工厂
// ---------------------------------------------------------------------------

export function createMatchSessionStore(): MatchSessionRepositoryPort {
  return {
    async upsert(session: MatchSession): Promise<void> {
      await upsertMatchSession(session);
    },

    async get(sessionId: string): Promise<MatchSession | null> {
      return getMatchSession(sessionId);
    },

    async end(sessionId: string, endedAt?: string): Promise<MatchSession | null> {
      return endMatchSession(sessionId, endedAt);
    },

    async count(): Promise<number> {
      const redis = getRedis();
      if (!redis) return memorySessions.size;
      const ids = await redis.smembers('match:sessions');
      return ids.length;
    },

    createSessionId(): string {
      return createSessionId();
    },

    async saveMessages(sessionId: string, messages: ConversationMessage[]): Promise<void> {
      await saveConversationMessages(sessionId, messages);
    },

    async incrementStats(categories: NeedCategory[]): Promise<void> {
      await incrementMatchStats(categories);
    },
  };
}
