import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { RateLimitPort } from '../ports/rate-limit.port';

interface WindowState {
  count: number;
  windowStart: number;
}

/** 进程内滑动窗口限流：自带定额与过期主动清理，支撑万人并发防内存泄漏 */
@Injectable()
export class InMemoryRateLimiter implements RateLimitPort {
  private readonly windows = new Map<string, WindowState>();
  private opsSinceCleanup = 0;
  private readonly maxEntries = 20_000;

  private cleanup(now: number): void {
    for (const [key, state] of this.windows.entries()) {
      if (now - state.windowStart > 3600_000) {
        this.windows.delete(key);
      }
    }
    if (this.windows.size > this.maxEntries) {
      let countToRemove = Math.floor(this.maxEntries * 0.2);
      for (const key of this.windows.keys()) {
        this.windows.delete(key);
        if (--countToRemove <= 0) break;
      }
    }
  }

  consume(key: string, limit: number, windowSec: number): boolean {
    const now = Date.now();
    this.opsSinceCleanup += 1;
    if (this.opsSinceCleanup > 500) {
      this.opsSinceCleanup = 0;
      this.cleanup(now);
    }

    const hashed = createHash('sha256').update(key).digest('hex').slice(0, 24);
    const state = this.windows.get(hashed);
    const windowMs = windowSec * 1000;
    if (!state || now - state.windowStart >= windowMs) {
      this.windows.set(hashed, { count: 1, windowStart: now });
      return true;
    }
    if (state.count >= limit) return false;
    state.count += 1;
    return true;
  }
}
