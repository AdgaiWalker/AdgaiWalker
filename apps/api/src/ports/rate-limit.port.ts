export interface RateLimitPort {
  /** 超限返回 false */
  consume(key: string, limit: number, windowSec: number): boolean;
}

export const RATE_LIMIT = Symbol('RATE_LIMIT');
