/**
 * 基础频率限流（P1-A04）
 *
 * 隐私护栏：不用 IP 明文作长期用户识别。用 IP 的 SHA-256 哈希 + 滚动窗口计数，
 * 窗口过期后丢弃，不长期留存可关联身份的标识。
 *
 * 策略：固定窗口（如 60s 内最多 N 次）。Redis 可用时用 INCR + EXPIRE 原子计数；
 * 无 Redis 时用进程内 Map（开发期降级）。
 */
import { createHash } from 'node:crypto';

import { getRedis } from '@/conversation/store';

export interface RateLimitConfig {
  /** 窗口秒数 */
  windowSeconds: number;
  /** 窗口内最大次数 */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** 当前窗口已用次数 */
  count: number;
  /** 距离窗口重置的秒数 */
  retryAfter: number;
}

/** 把 IP 哈希成不可逆短标识，避免明文长期留存 */
export function hashIdentifier(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 24);
}

function windowKey(namespace: string, hashedId: string, windowSeconds: number): string {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  return `ratelimit:${namespace}:${hashedId}:${bucket}`;
}

/**
 * 检查并计数。allowed=false 时表示超限（调用方返回 429）。
 */
export async function consumeRateLimit(
  namespace: string,
  ip: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const hashedId = hashIdentifier(ip);
  const key = windowKey(namespace, hashedId, config.windowSeconds);
  const now = Math.floor(Date.now() / 1000);
  const retryAfter = config.windowSeconds - (now % config.windowSeconds);

  const redis = getRedis();
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, config.windowSeconds);
      }
      return { allowed: count <= config.max, count, retryAfter };
    } catch {
      // Redis 异常时降级到内存（不阻断正常反馈）
    }
  }

  // 内存降级（开发期）
  const memCount = memoryCounters.get(key) ?? 0;
  const next = memCount + 1;
  memoryCounters.set(key, next);
  if (!memoryTimers.has(key)) {
    const timer = setTimeout(() => {
      memoryCounters.delete(key);
      memoryTimers.delete(key);
    }, config.windowSeconds * 1000);
    memoryTimers.set(key, timer);
  }
  return { allowed: next <= config.max, count: next, retryAfter };
}

// 进程内内存计数器（仅 Redis 不可用时）
const memoryCounters = new Map<string, number>();
const memoryTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** 仅测试用：清空内存计数器 */
export function __resetMemoryRateLimit(): void {
  for (const timer of memoryTimers.values()) clearTimeout(timer);
  memoryCounters.clear();
  memoryTimers.clear();
}
