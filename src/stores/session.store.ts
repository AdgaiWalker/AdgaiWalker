/**
 * Session Store — 实现 SessionRepositoryPort
 *
 * 账号认证系统的登录会话存储（Redis + 内存降级，自包含，不依赖 store.ts 的 invited 残留）。
 * Cookie 装签名 sessionId，真会话有效性查这里。
 */

import type { SessionRepositoryPort, UserSession } from './ports';
import { getRedis } from '@/conversation/store';

// 内存降级存储（Redis 不可用时启用）
const memorySessions = new Map<string, UserSession>();

// Redis key 约定
function sessionKey(sessionId: string): string {
  return `auth:session:${sessionId}`;
}

export function createSessionStore(): SessionRepositoryPort {
  return {
    async create(session: UserSession): Promise<void> {
      const redis = getRedis();
      memorySessions.set(session.sessionId, session);
      if (!redis) return;
      // 按 expiresAt 算 TTL，最小 60 秒
      const ttlSeconds = Math.max(60, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
      await redis.set(sessionKey(session.sessionId), session, { ex: ttlSeconds });
    },

    async get(sessionId: string): Promise<UserSession | null> {
      const redis = getRedis();
      if (!redis) return memorySessions.get(sessionId) ?? null;
      return (await redis.get<UserSession>(sessionKey(sessionId))) ?? memorySessions.get(sessionId) ?? null;
    },

    async isValid(sessionId: string): Promise<boolean> {
      const session = await this.get(sessionId);
      if (!session) return false;
      return new Date(session.expiresAt).getTime() > Date.now();
    },

    async revoke(sessionId: string): Promise<void> {
      const redis = getRedis();
      memorySessions.delete(sessionId);
      if (!redis) return;
      await redis.del(sessionKey(sessionId));
    },
  };
}
