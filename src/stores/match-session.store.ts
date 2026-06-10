/**
 * 匹配会话 Store — 实现 MatchSessionRepositoryPort
 *
 * 委托给 conversation/store.ts，保持兼容。
 */

import type { MatchSession, MatchSessionRepositoryPort } from './ports';

import {
  upsertMatchSession as legacyUpsert,
  getMatchSession as legacyGet,
  endMatchSession as legacyEnd,
} from '@/conversation/store';

export function createMatchSessionStore(): MatchSessionRepositoryPort {
  return {
    async upsert(session: MatchSession): Promise<void> {
      await legacyUpsert(session as Parameters<typeof legacyUpsert>[0]);
    },

    async get(sessionId: string): Promise<MatchSession | null> {
      return legacyGet(sessionId) as Promise<MatchSession | null>;
    },

    async end(sessionId: string, endedAt?: string): Promise<MatchSession | null> {
      return legacyEnd(sessionId, endedAt) as Promise<MatchSession | null>;
    },

    async count(): Promise<number> {
      // 会话计数暂时用内存估算
      const { getRedis } = await import('@/conversation/store');
      const redis = getRedis();
      if (redis) {
        const ids = await redis.smembers('match:sessions');
        return ids.length;
      }
      return 0;
    },
  };
}
