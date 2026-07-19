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
 *
 * 环境感知：限流是生产防滥用护栏。开发/测试环境（!PROD）所有测试与开发机共享同一来源 IP，
 * 跨用例合法提交会人造地撞上单访客限流（如 E2E 套件 admin-workbench + content-feedback 共 6+ 次
 * content-feedback POST 共享一桶），因此非生产环境放宽有效上限；生产（PROD）严格按 config.max。
 */
const DEV_MAX_MULTIPLIER = 50;
/** 当前环境下的有效上限：生产严格按 config.max；开发/测试放宽（限流是生产防滥用，dev 不该阻断测试/开发机）。 */
export function effectiveMax(config: RateLimitConfig): number {
  return import.meta.env.PROD ? config.max : config.max * DEV_MAX_MULTIPLIER;
}

export async function consumeRateLimit(
  namespace: string,
  ip: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const hashedId = hashIdentifier(ip);
  const key = windowKey(namespace, hashedId, config.windowSeconds);
  const now = Math.floor(Date.now() / 1000);
  const retryAfter = config.windowSeconds - (now % config.windowSeconds);
  const max = effectiveMax(config);

  const redis = getRedis();
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, config.windowSeconds);
      }
      return { allowed: count <= max, count, retryAfter };
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
  return { allowed: next <= max, count: next, retryAfter };
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
