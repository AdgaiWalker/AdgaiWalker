/**
 * 轻量限流（固定窗口：Redis incr + expire，内存降级）。
 * 用于 auth 端点防暴力破解：rateLimit(key, { windowMs, max })。
 */
import { getRedis } from '@/conversation/store';

const memory = new Map<string, { count: number; resetAt: number }>();

/** 窗口内超过 max 则拒绝。返回 { allowed, remaining }。 */
export async function rateLimit(
  key: string,
  opts: { windowMs: number; max: number },
): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedis();
  const windowSec = Math.max(1, Math.ceil(opts.windowMs / 1000));
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSec);
      return { allowed: count <= opts.max, remaining: Math.max(0, opts.max - count) };
    } catch {
      /* Redis 异常 → 降级内存 */
    }
  }
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now > entry.resetAt) {
    memory.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: opts.max >= 1, remaining: Math.max(0, opts.max - 1) };
  }
  entry.count += 1;
  return { allowed: entry.count <= opts.max, remaining: Math.max(0, opts.max - entry.count) };
}

export function getClientIP(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || 'unknown';
}
