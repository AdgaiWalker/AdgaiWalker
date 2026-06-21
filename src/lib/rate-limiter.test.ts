import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetMemoryRateLimit, consumeRateLimit, effectiveMax, hashIdentifier } from './rate-limiter';

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

  it('effectiveMax：生产严格 config.max；开发/测试放宽（不阻断跨用例合法提交）', () => {
    const cfg = { windowSeconds: 60, max: 5 };
    // 测试在 !PROD 运行 → 放宽（生产语义由 import.meta.env.PROD 控制，这里只锁定 dev 行为）
    expect(effectiveMax(cfg)).toBe(cfg.max * 50);
  });

  it('窗口内未达有效上限放行，超出后拒绝', async () => {
    const cfg = { windowSeconds: 60, max: 1 };
    const limit = effectiveMax(cfg); // dev 环境 = 50
    // 前 limit 次放行
    for (let i = 0; i < limit; i++) {
      const r = await consumeRateLimit('cf', '9.9.9.9', cfg);
      expect(r.allowed).toBe(true);
    }
    // 第 limit+1 次拒绝
    const over = await consumeRateLimit('cf', '9.9.9.9', cfg);
    expect(over.allowed).toBe(false);
    expect(over.retryAfter).toBeGreaterThan(0);
  });

  it('不同 IP 各自独立计数', async () => {
    const cfg = { windowSeconds: 60, max: 1 };
    const limit = effectiveMax(cfg);
    // 10.0.0.1 用满 limit 次
    for (let i = 0; i < limit; i++) {
      await consumeRateLimit('cf', '10.0.0.1', cfg);
    }
    // 10.0.0.2 不受影响，仍放行
    const b1 = await consumeRateLimit('cf', '10.0.0.2', cfg);
    expect(b1.allowed).toBe(true);
    // 10.0.0.1 已用满，再请求拒绝
    const aOver = await consumeRateLimit('cf', '10.0.0.1', cfg);
    expect(aOver.allowed).toBe(false);
  });
});
