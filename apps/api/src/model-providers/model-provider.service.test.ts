import { beforeEach, describe, expect, it } from 'vitest';
import { ModelProviderService } from './model-provider.service';
import type {
  ModelProviderPublicRow,
  ModelProviderRepositoryPort,
  ModelProviderRow,
} from '../ports/model-provider.repository';

const TEST_KEY = 'c'.repeat(64);

class FakeModelRepo implements ModelProviderRepositoryPort {
  rows: ModelProviderRow[] = [];

  async list(): Promise<ModelProviderPublicRow[]> {
    return this.rows.map((r) => {
      let models = [];
      try {
        models = JSON.parse(r.modelsJson);
      } catch {
        models = [];
      }
      return {
        id: r.id,
        name: r.name,
        category: r.category,
        enabled: r.enabled,
        baseUrl: r.baseUrl,
        apiFormat: r.apiFormat,
        last4: r.last4,
        models,
        updatedAt: r.updatedAt,
      };
    });
  }

  async findById(id: string): Promise<ModelProviderRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async save(row: Omit<ModelProviderRow, 'createdAt' | 'updatedAt'>): Promise<ModelProviderRow> {
    const existing = this.rows.find((r) => r.id === row.id);
    const now = new Date();
    if (existing) {
      Object.assign(existing, row, { updatedAt: now });
      return existing;
    }
    const created: ModelProviderRow = { ...row, createdAt: now, updatedAt: now };
    this.rows.push(created);
    return created;
  }

  async remove(id: string): Promise<void> {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
}

describe('ModelProviderService', () => {
  let repo: FakeModelRepo;
  let service: ModelProviderService;

  beforeEach(() => {
    process.env.WALKER_CREDENTIAL_MASTER_KEY = TEST_KEY;
    repo = new FakeModelRepo();
    service = new ModelProviderService(repo);
  });

  it('自动初始化预置 DeepSeek 官方供应商', async () => {
    const list = await service.list();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('deepseek');
    expect(list[0].category).toBe('official');
  });

  it('支持新增自定义供应商，加密 API Key 并解密', async () => {
    await service.upsert({
      id: 'custom-stepfun',
      name: '阶跃星辰',
      baseUrl: 'https://api.stepfun.com/step_plan',
      apiKey: 'sk-stepfun-secret-1234',
    });

    const list = await service.list();
    const custom = list.find((p) => p.id === 'custom-stepfun');
    expect(custom).toBeDefined();
    expect(custom?.last4).toBe('1234');

    const decrypted = await service.getDecryptedApiKey('custom-stepfun');
    expect(decrypted).toBe('sk-stepfun-secret-1234');
  });

  it('禁止删除官方预置供应商', async () => {
    await service.ensureDefaultProvider();
    await expect(service.remove('deepseek')).rejects.toThrow('官方预置供应商不可删除');
  });

  it('允许删除自定义供应商', async () => {
    await service.upsert({
      id: 'temp-provider',
      name: '临时供应商',
      baseUrl: 'https://api.temp.com/v1',
    });
    await service.remove('temp-provider');
    const list = await service.list();
    expect(list.find((p) => p.id === 'temp-provider')).toBeUndefined();
  });
});
