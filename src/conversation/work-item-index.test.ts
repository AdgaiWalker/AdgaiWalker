import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LearningRequest, LearningRequestStatus, WorkItem, WorkItemStatus } from '@/stores/ports';
import {
  __resetMemoryLearningRequests,
  __resetMemoryWorkItems,
  __setCachedRedisForTesting,
  findLearningRequestsByStatus,
  listWorkItems,
  saveLearningRequest,
  saveWorkItem,
} from '@/conversation/store';

/**
 * 这些测试覆盖 saveWorkItem / listWorkItems 的 Redis 索引维护逻辑。
 * 默认测试环境无 Redis，getRedis() 返回 null 走内存路径（不用索引），
 * 因此 Redis 路径的索引维护在此前无任何覆盖。这里注入 FakeRedis 锁定：
 *   1. 状态迁移必须从旧状态索引移除（否则脏索引）
 *   2. 单状态过滤在脏条目超过 limit 时仍返回真实待处理项（修复前会返回错误空列表）
 *   3. 多次状态迁移不在中途状态留残留
 * FakeRedis 语义对齐 @upstash/redis：set/get 自动对象序列化、lpush 前插、lrem 全删匹配。
 * multi() 返回链式 builder，exec() 顺序应用命令（不验证真实原子性——那是 Upstash 的职责，
 * 由 scripts/verify-production-storage.mjs 在真实凭据环境验证；这里验证命令序列与索引正确性）。
 */
class FakeRedis {
  values = new Map<string, unknown>();
  lists = new Map<string, string[]>();
  /** 最近一次 multi() 事务内排队的命令 op 序列，供测试断言事务边界。 */
  multiCommands: string[] = [];

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

  async ltrim(key: string, start: number, stop: number): Promise<'OK'> {
    const list = this.lists.get(key) ?? [];
    const end = stop < 0 ? list.length + stop + 1 : stop + 1;
    this.lists.set(key, list.slice(start, end));
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const existed = this.values.delete(key) || this.lists.delete(key);
    return existed ? 1 : 0;
  }

  multi(): FakePipeline {
    const commands: string[] = [];
    this.multiCommands = commands;
    return new FakePipeline(this, commands);
  }
}

/** FakeRedis 的 MULTI 事务 builder：排队命令、exec() 顺序应用。 */
class FakePipeline {
  private queued: Array<() => Promise<unknown>> = [];

  constructor(private redis: FakeRedis, private commands: string[]) {}

  set(key: string, value: unknown): this {
    this.commands.push(`set:${key}`);
    this.queued.push(() => this.redis.set(key, value));
    return this;
  }

  lpush<TData>(key: string, ...elements: TData[]): this {
    this.commands.push(`lpush:${key}`);
    this.queued.push(() => this.redis.lpush(key, ...elements));
    return this;
  }

  lrem<TData>(key: string, count: number, value: TData): this {
    this.commands.push(`lrem:${key}`);
    this.queued.push(() => this.redis.lrem(key, count, value));
    return this;
  }

  ltrim(key: string, start: number, stop: number): this {
    this.commands.push(`ltrim:${key}`);
    this.queued.push(() => this.redis.ltrim(key, start, stop));
    return this;
  }

  async exec(): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const fn of this.queued) results.push(await fn());
    return results;
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
  return redis.lists.get(`admin:workitems:by-state:${status}`) ?? [];
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

describe('saveWorkItem MULTI 事务原子性（P0-B02）', () => {
  let redis: FakeRedis;

  beforeEach(() => {
    __resetMemoryWorkItems();
    redis = new FakeRedis();
    __setCachedRedisForTesting(redis);
  });

  afterEach(() => {
    __setCachedRedisForTesting(undefined);
  });

  it('状态迁移时实体与全部索引写入放进单个 MULTI 事务', async () => {
    const item = makeWorkItem('wi-tx', 'pending');
    await saveWorkItem(item);

    // pending -> accepted：一次 saveWorkItem 应只触发一个 multi() 事务，
    // 且事务内命令序列覆盖：set 实体 + lrem 旧状态索引 + lrem/lpush 新状态索引。
    redis.multiCommands = [];
    item.status = 'accepted';
    item.updatedAt = '2026-06-21T00:00:02.000Z';
    await saveWorkItem(item);

    const ops = redis.multiCommands;
    // 只有一个 set（实体），证明单事务
    expect(ops.filter(op => op.startsWith('set:'))).toHaveLength(1);
    expect(ops[0]).toBe('set:admin:workitem:wi-tx');
    // 包含旧状态索引 lrem（pending）与新状态索引 lrem+lpush（accepted）
    expect(ops).toContain('lrem:admin:workitems:by-state:pending');
    expect(ops).toContain('lrem:admin:workitems:by-state:accepted');
    expect(ops).toContain('lpush:admin:workitems:by-state:accepted');
    // 命令顺序：旧状态 lrem 必须在新状态 lrem/lpush 之前（幂等 defense-in-depth）
    const oldIdx = ops.indexOf('lrem:admin:workitems:by-state:pending');
    const newPush = ops.indexOf('lpush:admin:workitems:by-state:accepted');
    expect(oldIdx).toBeLessThan(newPush);
    expect(oldIdx).toBeGreaterThan(-1);
  });

  it('首次创建把实体 + 全表 + 活跃 + 状态索引都放进同一事务', async () => {
    const item = makeWorkItem('wi-new', 'proposal');
    await saveWorkItem(item);

    const ops = redis.multiCommands;
    expect(ops).toContain('set:admin:workitem:wi-new');
    expect(ops).toContain('lpush:admin:workitems');
    expect(ops).toContain('lpush:admin:workitems:active');
    expect(ops).toContain('lpush:admin:workitems:by-state:proposal');
  });
});

describe('saveLearningRequest 状态索引完整性（P0-B02 修复脏索引 bug）', () => {
  let redis: FakeRedis;

  beforeEach(() => {
    __resetMemoryLearningRequests();
    redis = new FakeRedis();
    __setCachedRedisForTesting(redis);
  });

  afterEach(() => {
    __setCachedRedisForTesting(undefined);
  });

  function makeRequest(id: string, status: LearningRequestStatus): LearningRequest {
    const now = '2026-06-21T00:00:00.000Z';
    return {
      requestId: id,
      createdAt: now,
      updatedAt: now,
      evidenceGap: 'practice',
      context: 'LearningRequest 索引完整性测试',
      expectedEvidence: '一条实践证据',
      status,
    };
  }

  function statusIds(redis: FakeRedis, status: LearningRequestStatus): string[] {
    return redis.lists.get(`learning-request:by-status:${status}`) ?? [];
  }

  it('状态迁移后从旧 by-status 索引移除并写入新索引', async () => {
    const request = makeRequest('lr-a', 'open');
    await saveLearningRequest(request);
    expect(statusIds(redis, 'open')).toContain('lr-a');

    // open -> fulfilled
    request.status = 'fulfilled';
    request.updatedAt = '2026-06-21T00:00:01.000Z';
    await saveLearningRequest(request);

    expect(statusIds(redis, 'open')).not.toContain('lr-a');
    expect(statusIds(redis, 'fulfilled')).toContain('lr-a');
  });

  it('findLearningRequestsByStatus 单状态过滤在脏条目超 limit 时仍返回真实项', async () => {
    // 修复前的核心回归：旧 saveLearningRequest 不清理旧状态索引，open 索引积累脏 id。
    const keep = makeRequest('lr-keep', 'open');
    await saveLearningRequest(keep);

    for (let i = 0; i < 210; i++) {
      const polluter = makeRequest(`lr-p-${i}`, 'open');
      await saveLearningRequest(polluter);
      polluter.status = 'fulfilled';
      await saveLearningRequest(polluter);
    }

    // findLearningRequestsByStatus 用 lrange(0, 199) 读 open 索引；修复前该窗口全是脏 id。
    const open = await findLearningRequestsByStatus('open');
    expect(open.map(r => r.requestId)).toEqual(['lr-keep']);
  });

  it('同状态重复保存不产生重复索引条目', async () => {
    const request = makeRequest('lr-dup', 'open');
    await saveLearningRequest(request);
    await saveLearningRequest(request);
    await saveLearningRequest(request);

    const ids = statusIds(redis, 'open').filter(id => id === 'lr-dup');
    expect(ids).toHaveLength(1);
  });

  it('实体与索引写入放进单个 MULTI 事务', async () => {
    const request = makeRequest('lr-tx', 'open');
    await saveLearningRequest(request);
    request.status = 'fulfilled';
    await saveLearningRequest(request);

    const ops = redis.multiCommands;
    expect(ops.filter(op => op.startsWith('set:'))).toHaveLength(1);
    expect(ops).toContain('lrem:learning-request:by-status:open');
    expect(ops).toContain('lpush:learning-request:by-status:fulfilled');
  });
});
