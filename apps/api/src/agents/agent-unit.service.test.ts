import { beforeEach, describe, expect, it } from 'vitest';
import { AgentUnitService } from './agent-unit.service';
import type {
  AgentUnitRepositoryPort,
  AgentUnitRow,
} from '../ports/agent-unit.repository';

class FakeAgentRepo implements AgentUnitRepositoryPort {
  rows: AgentUnitRow[] = [];

  async list(): Promise<AgentUnitRow[]> {
    return [...this.rows].sort((a, b) => (b.isSystem ? 1 : 0) - (a.isSystem ? 1 : 0));
  }

  async findById(id: string): Promise<AgentUnitRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async save(row: Omit<AgentUnitRow, 'createdAt' | 'updatedAt'>): Promise<AgentUnitRow> {
    const existing = this.rows.find((r) => r.id === row.id);
    const now = new Date();
    if (existing) {
      Object.assign(existing, row, { updatedAt: now });
      return existing;
    }
    const created: AgentUnitRow = { ...row, createdAt: now, updatedAt: now };
    this.rows.push(created);
    return created;
  }

  async remove(id: string): Promise<void> {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
}

describe('AgentUnitService', () => {
  let repo: FakeAgentRepo;
  let service: AgentUnitService;

  beforeEach(() => {
    repo = new FakeAgentRepo();
    service = new AgentUnitService(repo);
  });

  it('自动初始化预置小影（isSystem = true）', async () => {
    const list = await service.list();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('xiaoying');
    expect(list[0].isSystem).toBe(true);
  });

  it('坚决禁止删除内置角色「小影」（抛 403）', async () => {
    await service.ensureDefaultAgent();
    await expect(service.remove('xiaoying')).rejects.toThrow('内置角色「小影」为系统底座，禁止删除');
  });

  it('允许新增与删除自定义智能体', async () => {
    await service.upsert({
      id: 'article-craftsman',
      name: '文章工匠',
      icon: 'pen-tool',
      prompt: '你专注于文章排版与润色',
    });

    let list = await service.list();
    expect(list.length).toBe(2);
    expect(list.some((a) => a.id === 'article-craftsman')).toBe(true);

    await service.remove('article-craftsman');
    list = await service.list();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('xiaoying');
  });
});
