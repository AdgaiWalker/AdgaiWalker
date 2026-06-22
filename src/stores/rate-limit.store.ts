/**
 * Rate Limit Store — 实现 RateLimitPort
 *
 * Redis INCR + EXPIRE 滑动窗口计数器，支持内存降级。
 * match.ts 用此 Port 控制每用户日限 / 分钟限 / 全局日限。
 */
import { getRedis } from '@/stores/redis-client';

import type { RateLimitCheckResult, RateLimitPort } from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储
// ---------------------------------------------------------------------------

const memoryCounters = new Map<string, { count: number; expiresAt: number }>();

// ---------------------------------------------------------------------------
// RateLimitPort 实现
// ---------------------------------------------------------------------------

export async function checkAndIncrement(
  key: string,
  windowSec: number,
  limit: number,
): Promise<RateLimitCheckResult> {
  const redis = getRedis();

  if (!redis) {
    const now = Date.now();
    const entry = memoryCounters.get(key);
    if (!entry || now > entry.expiresAt) {
      memoryCounters.set(key, { count: 1, expiresAt: now + windowSec * 1_000 });
      return { allowed: 1 <= limit, current: 1 };
    }
    entry.count += 1;
    return { allowed: entry.count <= limit, current: entry.count };
  }

  try {
    const current = await redis.incr(key);
    if (current === 1) await redis.expire(key, windowSec);
    return { allowed: current <= limit, current };
  } catch {
    return { allowed: true, current: 0 };
  }
}

/** 仅测试用：清空内存限流计数器，不触碰 Redis。 */
export function __resetMemoryRateLimits(): void {
  memoryCounters.clear();
}

// ---------------------------------------------------------------------------
// Port 工厂
// ---------------------------------------------------------------------------

export function createRateLimitStore(): RateLimitPort {
  return {
    async checkAndIncrement(key: string, windowSec: number, limit: number): Promise<RateLimitCheckResult> {
      return checkAndIncrement(key, windowSec, limit);
    },
  };
}
