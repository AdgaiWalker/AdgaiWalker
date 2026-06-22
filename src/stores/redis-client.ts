/**
 * Redis 客户端单例 — 全项目唯一的 Upstash Redis 入口。
 *
 * 每个域 Store 通过 `getRedis()` 获取共享客户端；无配置时返回 null，
 * 调用方按内存降级路径处理。缓存后多次调用零开销。
 */
import { Redis } from '@upstash/redis';

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

/** 复位缓存（测试用）。下次 getRedis() 重新按 env 解析。 */
export function resetRedisCache(): void {
  cachedRedis = undefined;
}

/** 仅测试用：注入 FakeRedis（或 null）覆盖 getRedis() 的缓存。 */
export function __setCachedRedisForTesting(redis: unknown): void {
  cachedRedis = (redis as Redis | null) ?? undefined;
}
