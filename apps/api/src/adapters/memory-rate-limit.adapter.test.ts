import { describe, expect, it } from 'vitest';
import { InMemoryRateLimiter } from './memory-rate-limit.adapter';

describe('InMemoryRateLimiter', () => {
  it('正确统计窗口内请求并在超限时拒绝', () => {
    const limiter = new InMemoryRateLimiter();
    const key = 'test-ip-1';
    expect(limiter.consume(key, 3, 60)).toBe(true);
    expect(limiter.consume(key, 3, 60)).toBe(true);
    expect(limiter.consume(key, 3, 60)).toBe(true);
    expect(limiter.consume(key, 3, 60)).toBe(false);
  });

  it('不同 key 之间互不干扰', () => {
    const limiter = new InMemoryRateLimiter();
    expect(limiter.consume('key-a', 1, 60)).toBe(true);
    expect(limiter.consume('key-a', 1, 60)).toBe(false);
    expect(limiter.consume('key-b', 1, 60)).toBe(true);
  });

  it('超过窗口时间后重置计数', async () => {
    const limiter = new InMemoryRateLimiter();
    const key = 'test-ip-2';
    expect(limiter.consume(key, 1, 1)).toBe(true);
    expect(limiter.consume(key, 1, 1)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1050));
    expect(limiter.consume(key, 1, 1)).toBe(true);
  });
});
