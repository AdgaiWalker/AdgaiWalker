import { describe, expect, it } from 'vitest';

import { createLikeStore } from '@/stores/like.store';

describe('like.store（无 Redis 环境走内存降级）', () => {
  // 测试环境无 UPSTASH_REDIS_REST_URL，工厂返回内存实现
  const store = createLikeStore();

  it('getCount 未点赞路径返回 0（不是写死的假基数 17861）', async () => {
    expect(await store.getCount('/posts/never-liked-001')).toBe(0);
  });

  it('increment 新路径返回 count=1 且 cooled=false', async () => {
    const r = await store.increment('/posts/new-post-001', '1.1.1.1');
    expect(r.count).toBe(1);
    expect(r.cooled).toBe(false);
  });

  it('increment 后 getCount 反映真实计数（连续累加）', async () => {
    const path = '/posts/reflect-001';
    await store.increment(path, '2.2.2.2');
    await store.increment(path, '3.3.3.3');
    expect(await store.getCount(path)).toBe(2);
  });

  it('同 IP 冷却期内再次点赞返回 cooled=true 且计数不变', async () => {
    const path = '/posts/cooldown-001';
    const first = await store.increment(path, '4.4.4.4');
    const second = await store.increment(path, '4.4.4.4');
    expect(first.cooled).toBe(false);
    expect(second.cooled).toBe(true);
    expect(second.count).toBe(first.count);
  });

  it('不同 IP 互不冷却，各自独立累加', async () => {
    const path = '/posts/multi-ip-001';
    const a = await store.increment(path, '5.5.5.5');
    const b = await store.increment(path, '6.6.6.6');
    expect(a.cooled).toBe(false);
    expect(b.cooled).toBe(false);
    expect(b.count).toBe(a.count + 1);
  });
});
