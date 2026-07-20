import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { RateLimitPort } from '../ports/rate-limit.port';

interface WindowState {
  count: number;
  windowStart: number;
}

/** 进程内滑动窗口限流（首版单实例） */
@Injectable()
export class InMemoryRateLimiter implements RateLimitPort {
  private readonly windows = new Map<string, WindowState>();

  consume(key: string, limit: number, windowSec: number): boolean {
    const now = Date.now();
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
