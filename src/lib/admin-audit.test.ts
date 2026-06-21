import { beforeEach, describe, expect, it } from 'vitest';

import { __listMemoryAdminAudit, __resetMemoryAdminAudit, requireHighRiskAudit } from './admin-audit';

class FakeAuditRedis {
  values = new Map<string, unknown>();
  lists = new Map<string, string[]>();
  failWrite = false;

  async set(key: string, value: unknown): Promise<'OK'> {
    if (this.failWrite) throw new Error('write failed');
    this.values.set(key, value);
    return 'OK';
  }

  async lpush<TData>(key: string, ...elements: TData[]): Promise<number> {
    if (this.failWrite) throw new Error('write failed');
    const list = this.lists.get(key) ?? [];
    for (const element of elements) list.unshift(String(element));
    this.lists.set(key, list);
    return list.length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<'OK'> {
    if (this.failWrite) throw new Error('write failed');
    const list = this.lists.get(key) ?? [];
    const end = stop < 0 ? list.length : stop + 1;
    this.lists.set(key, list.slice(start, end));
    return 'OK';
  }
}

describe('admin-audit 高风险动作门闩', () => {
  beforeEach(() => __resetMemoryAdminAudit());

  it('生产环境缺少 Redis 时拒绝高风险动作，不写内存冒充审计', async () => {
    const result = await requireHighRiskAudit({
      actor: 'owner',
      action: 'account.delete',
      targetType: 'account',
      targetId: 'user_a',
      reason: '测试删除账号',
    }, { redis: null, environment: 'production' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected audit gate to fail');
    expect(result.code).toBe('storage-unavailable');
    expect(result.status).toBe(503);
    expect(__listMemoryAdminAudit()).toHaveLength(0);
  });

  it('Redis 审计写入失败时拒绝高风险动作，并回滚内存审计', async () => {
    const redis = new FakeAuditRedis();
    redis.failWrite = true;

    const result = await requireHighRiskAudit({
      actor: 'owner',
      action: 'gateway.config.reset',
      targetType: 'ai-gateway',
      reason: '测试重置网关',
    }, { redis, environment: 'production' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected audit gate to fail');
    expect(result.code).toBe('audit-write-failed');
    expect(result.status).toBe(503);
    expect(__listMemoryAdminAudit()).toHaveLength(0);
  });

  it('Redis 审计成功后返回事件，并过滤敏感 detail 字段', async () => {
    const redis = new FakeAuditRedis();

    const result = await requireHighRiskAudit({
      actor: 'owner',
      action: 'gateway.config.update',
      targetType: 'ai-gateway',
      reason: '测试修改网关',
      detail: { fields: ['model', 'apiKey'], apiKey: 'secret-key' },
    }, { redis, environment: 'production' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.storageMode).toBe('redis');
    expect(result.event.detail).toEqual({ fields: ['model', 'apiKey'] });
    expect(redis.values.size).toBe(1);
    expect(redis.lists.get('admin:audit:high-risk:recent')).toEqual([result.event.auditId]);
  });

  it('开发环境无 Redis 时允许明确的内存审计', async () => {
    const result = await requireHighRiskAudit({
      actor: 'owner',
      action: 'content.delete',
      targetType: 'content',
      targetId: 'draft-a',
      reason: '本地删除草稿',
    }, { redis: null, environment: 'development' });

    expect(result.ok).toBe(true);
    expect(__listMemoryAdminAudit()).toHaveLength(1);
  });
});
