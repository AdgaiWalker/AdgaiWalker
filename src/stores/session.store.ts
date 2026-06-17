/**
 * Session Store — 实现 SessionRepositoryPort
 *
 * 账号认证系统的登录会话存储（Redis + 内存降级，自包含，不依赖 store.ts 的 invited 残留）。
 * Cookie 装签名 sessionId，真会话有效性查这里。
 *
 * 维护 username → sessionId 索引（auth:sessions-by-user:<username>），供 killAllByUsername 用：
 * 改密 / 重置 / 封禁 即时踢掉该用户全部会话。
 */

import type { SessionRepositoryPort, UserSession } from './ports';
import { getRedis } from '@/conversation/store';

// 内存降级存储（Redis 不可用时启用）
const memorySessions = new Map<string, UserSession>();
const memorySessionsByUser = new Map<string, Set<string>>();

// Redis key 约定
function sessionKey(sessionId: string): string {
  return `auth:session:${sessionId}`;
}
function sessionsByUserKey(username: string): string {
  return `auth:sessions-by-user:${username}`;
}

function indexAdd(username: string, sessionId: string): void {
  let set = memorySessionsByUser.get(username);
  if (!set) { set = new Set(); memorySessionsByUser.set(username, set); }
  set.add(sessionId);
}
function indexRemove(username: string, sessionId: string): void {
  memorySessionsByUser.get(username)?.delete(sessionId);
}

export function createSessionStore(): SessionRepositoryPort {
  return {
    async create(session: UserSession): Promise<void> {
      const redis = getRedis();
      memorySessions.set(session.sessionId, session);
      indexAdd(session.username, session.sessionId);
      if (!redis) return;
      const ttlSeconds = Math.max(60, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
      await redis.set(sessionKey(session.sessionId), session, { ex: ttlSeconds });
      await redis.sadd(sessionsByUserKey(session.username), session.sessionId);
      await redis.expire(sessionsByUserKey(session.username), ttlSeconds);
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
      const session = memorySessions.get(sessionId) ?? await this.get(sessionId);
      memorySessions.delete(sessionId);
      if (session) indexRemove(session.username, sessionId);
      const redis = getRedis();
      if (!redis) return;
      await redis.del(sessionKey(sessionId));
      if (session) await redis.srem(sessionsByUserKey(session.username), sessionId);
    },

    async killAllByUsername(username: string, exceptSessionId?: string): Promise<void> {
      // 内存
      const memIds = memorySessionsByUser.get(username);
      if (memIds) {
        for (const sid of [...memIds]) {
          if (sid === exceptSessionId) continue;
          memorySessions.delete(sid);
          indexRemove(username, sid);
        }
      }
      const redis = getRedis();
      if (!redis) return;
      const ids = await redis.smembers<string>(sessionsByUserKey(username));
      const toKill = ids.filter((sid) => sid !== exceptSessionId);
      if (toKill.length === 0) return;
      await Promise.all(toKill.map((sid) => redis.del(sessionKey(sid))));
      // 重建索引集合（仅保留 except）
      await redis.del(sessionsByUserKey(username));
      if (exceptSessionId && ids.includes(exceptSessionId)) {
        await redis.sadd(sessionsByUserKey(username), exceptSessionId);
      }
    },
  };
}
