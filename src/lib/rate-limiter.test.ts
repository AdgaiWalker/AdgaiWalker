import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetMemoryRateLimit, consumeRateLimit, hashIdentifier } from './rate-limiter';

describe('rate-limiter（P1-A04）', () => {
  beforeEach(() => __resetMemoryRateLimit());
  afterEach(() => __resetMemoryRateLimit());

  it('hashIdentifier 不暴露明文 IP，且相同 IP 产生相同哈希', () => {
    const h1 = hashIdentifier('1.2.3.4');
    const h2 = hashIdentifier('1.2.3.4');
    const h3 = hashIdentifier('1.2.3.5');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).not.toContain('1.2.3.4');
    expect(h1).toHaveLength(24);
  });

  it('窗口内未超限时放行，超限后拒绝', async () => {
    const cfg = { windowSeconds: 60, max: 3 };
    const r1 = await consumeRateLimit('cf', '9.9.9.9', cfg);
    const r2 = await consumeRateLimit('cf', '9.9.9.9', cfg);
    const r3 = await consumeRateLimit('cf', '9.9.9.9', cfg);
    const r4 = await consumeRateLimit('cf', '9.9.9.9', cfg);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r4.allowed).toBe(false); // 第 4 次超限
    expect(r4.retryAfter).toBeGreaterThan(0);
  });

  it('不同 IP 各自独立计数', async () => {
    const cfg = { windowSeconds: 60, max: 1 };
    const a1 = await consumeRateLimit('cf', '10.0.0.1', cfg);
    const b1 = await consumeRateLimit('cf', '10.0.0.2', cfg);
    const a2 = await consumeRateLimit('cf', '10.0.0.1', cfg);
    expect(a1.allowed).toBe(true);
    expect(b1.allowed).toBe(true); // 不同 IP，不互相影响
    expect(a2.allowed).toBe(false); // 10.0.0.1 第二次超限
  });
});
