import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { WorkItem, WorkItemStatus } from '@/stores/ports';
import {
  __resetMemoryWorkItems,
  __setCachedRedisForTesting,
  listWorkItems,
  saveWorkItem,
} from '@/conversation/store';

/**
 * 这些测试覆盖 saveWorkItem / listWorkItems 的 Redis 索引维护逻辑。
 * 默认测试环境无 Redis，getRedis() 返回 null 走内存路径（不用索引），
 * 因此 Redis 路径的索引维护在此前无任何覆盖。这里注入 FakeRedis 锁定：
 *   1. 状态迁移必须从旧状态索引移除（否则脏索引）
 *   2. 单状态过滤在脏条目超 limit 时仍返回真实待处理项（修复前会返回错误空列表）
 *   3. 多次状态迁移不在中途状态留残留
 * FakeRedis 语义对齐 @upstash/redis：set/get 自动对象序列化、lpush 前插、lrem 全删匹配。
 */
class FakeRedis {
  values = new Map<string, unknown>();
  lists = new Map<string, string[]>();

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async set(key: string, value: unknown): Promise<'OK'> {
    // 对齐 @upstash/redis：set 时 JSON 序列化隔离，调用方后续 mutate 原对象不影响已存快照。
    this.values.set(key, JSON.parse(JSON.stringify(value)));
    return 'OK';
  }

  async lpush<TData>(key: string, ...elements: TData[]): Promise<number> {
    const list = this.lists.get(key) ?? [];
    for (const element of elements) list.unshift(String(element));
    this.lists.set(key, list);
    return list.length;
  }

  async lrange<T = string>(key: string, start: number, stop: number): Promise<T[]> {
    const list = this.lists.get(key) ?? [];
    const end = stop < 0 ? list.length : stop + 1;
    return list.slice(start, end) as T[];
  }

  async lrem<TData>(key: string, _count: number, value: TData): Promise<number> {
    const list = this.lists.get(key) ?? [];
    const target = String(value);
    const next = list.filter(item => item !== target);
    this.lists.set(key, next);
    return list.length - next.length;
  }

  async del(key: string): Promise<number> {
    const existed = this.values.delete(key) || this.lists.delete(key);
    return existed ? 1 : 0;
  }
}

function makeWorkItem(id: string, status: WorkItemStatus): WorkItem {
  const now = '2026-06-21T00:00:00.000Z';
  return {
    workItemId: id,
    queue: 'system-event',
    title: `测试事项 ${id}`,
    summary: '状态索引完整性测试',
    status,
    priorityBand: 'now',
    priorityReasons: ['测试'],
    uncertainty: [],
    evidenceRefs: [],
    decision: { requestedDecision: '测试', outcome: 'pending' },
    actions: [],
    outcomes: [],
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

function stateIndexIds(redis: FakeRedis, status: WorkItemStatus): string[] {
  return redis.lists.get(`match:workitems:by-state:${status}`) ?? [];
}

describe('saveWorkItem Redis 状态索引完整性', () => {
  let redis: FakeRedis;

  beforeEach(() => {
    __resetMemoryWorkItems();
    redis = new FakeRedis();
    __setCachedRedisForTesting(redis);
  });

  afterEach(() => {
    __setCachedRedisForTesting(undefined);
  });

  it('状态迁移后从旧状态索引移除并写入新状态索引（不产生脏索引）', async () => {
    const item = makeWorkItem('wi-a', 'pending');
    await saveWorkItem(item);

    expect(stateIndexIds(redis, 'pending')).toContain('wi-a');

    // pending -> accepted
    item.status = 'accepted';
    item.updatedAt = '2026-06-21T00:00:01.000Z';
    await saveWorkItem(item);

    expect(stateIndexIds(redis, 'pending')).not.toContain('wi-a');
    expect(stateIndexIds(redis, 'accepted')).toContain('wi-a');
  });

  it('listWorkItems 单状态过滤在脏条目超过 limit 时仍返回真实待处理项', async () => {
    // 这是修复前会失败的核心回归：旧实现不清理旧状态索引，pending 索引积累脏 id，
    // lrange(0, limit-1) 读到的全是已迁出条目，re-filter 后返回错误空列表。
    const keep = makeWorkItem('wi-keep', 'pending');
    await saveWorkItem(keep);

    // 制造 55 个先 pending 后 accepted 的事项，污染 pending 索引（修复前会残留）。
    for (let i = 0; i < 55; i++) {
      const polluter = makeWorkItem(`wi-p-${i}`, 'pending');
      await saveWorkItem(polluter);
      polluter.status = 'accepted';
      await saveWorkItem(polluter);
    }

    const pending = await listWorkItems({ status: 'pending', limit: 50 });
    expect(pending.map(w => w.workItemId)).toEqual(['wi-keep']);
  });

  it('多次状态迁移不在中途状态索引留残留', async () => {
    const item = makeWorkItem('wi-path', 'proposal');
    await saveWorkItem(item);

    for (const next of ['pending', 'accepted', 'acting', 'awaiting-verification', 'resolved'] as WorkItemStatus[]) {
      item.status = next;
      await saveWorkItem(item);
    }

    for (const status of ['proposal', 'pending', 'accepted', 'acting', 'awaiting-verification'] as WorkItemStatus[]) {
      expect(stateIndexIds(redis, status)).not.toContain('wi-path');
    }
    expect(stateIndexIds(redis, 'resolved')).toContain('wi-path');
  });

  it('同状态重复保存不产生重复索引条目', async () => {
    const item = makeWorkItem('wi-dup', 'pending');
    await saveWorkItem(item);
    await saveWorkItem(item);
    await saveWorkItem(item);

    const ids = stateIndexIds(redis, 'pending').filter(id => id === 'wi-dup');
    expect(ids).toHaveLength(1);
  });
});
