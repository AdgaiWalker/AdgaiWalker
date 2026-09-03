import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CredentialsService, CredentialMasterKeyMissingError } from './credentials.service';
import type {
  CredentialPublicRow,
  CredentialRepositoryPort,
  CredentialRow,
} from '../ports/credential.repository';

const KEY = 'b'.repeat(64);

class FakeRepo implements CredentialRepositoryPort {
  rows: CredentialRow[] = [];

  async list(): Promise<CredentialPublicRow[]> {
    return this.rows.map((r) => ({
      id: r.id,
      name: r.name,
      provider: r.provider,
      last4: r.last4,
      note: r.note,
      updatedAt: r.updatedAt,
    }));
  }
  async findByName(name: string) {
    return this.rows.find((r) => r.name === name) ?? null;
  }
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save(row: Omit<CredentialRow, 'createdAt' | 'updatedAt'>) {
    const existing = this.rows.find((r) => r.name === row.name);
    const now = new Date();
    if (existing) {
      Object.assign(existing, row, { updatedAt: now });
      return existing;
    }
    const created: CredentialRow = { ...row, createdAt: now, updatedAt: now };
    this.rows.push(created);
    return created;
  }
  async remove(id: string): Promise<void> {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
}

describe('CredentialsService', () => {
  let repo: FakeRepo;
  let service: CredentialsService;

  beforeEach(() => {
    process.env.WALKER_CREDENTIAL_MASTER_KEY = KEY;
    repo = new FakeRepo();
    service = new CredentialsService(repo);
  });

  afterEach(() => {
    delete process.env.WALKER_CREDENTIAL_MASTER_KEY;
  });

  it('未配置主密钥时 upsert 抛 503 语义错误', () => {
    delete process.env.WALKER_CREDENTIAL_MASTER_KEY;
    expect(
      service.upsert({ name: 'deepseek', provider: 'deepseek', secret: 'sk-abcdefgh' }),
    ).rejects.toBeInstanceOf(CredentialMasterKeyMissingError);
  });

  it('upsert 后列表只见尾 4 位，不见密文与明文', async () => {
    await service.upsert({
      name: 'deepseek',
      provider: 'deepseek-official',
      secret: 'sk-very-secret-key-9999',
    });
    const list = await service.list();
    expect(list).toHaveLength(1);
    expect(list[0].last4).toBe('9999');
    expect(JSON.stringify(list)).not.toContain('sk-very-secret');
    expect(JSON.stringify(list)).not.toContain('ciphertext');
    // 底层行也是密文
    expect(repo.rows[0].ciphertext).not.toContain('sk-very-secret');
  });

  it('reveal 用同一主密钥可还原明文', async () => {
    const saved = await service.upsert({
      name: 'deepseek',
      provider: 'deepseek-official',
      secret: 'sk-very-secret-key-9999',
    });
    const revealed = await service.reveal(saved.id);
    expect(revealed.secret).toBe('sk-very-secret-key-9999');
    expect(revealed.name).toBe('deepseek');
  });

  it('同名 upsert 更新而非新增，id 稳定', async () => {
    const first = await service.upsert({
      name: 'deepseek',
      provider: 'deepseek-official',
      secret: 'sk-first-secret-0001',
    });
    const second = await service.upsert({
      name: 'deepseek',
      provider: 'deepseek-official',
      secret: 'sk-second-secret-0002',
    });
    expect(second.id).toBe(first.id);
    expect((await service.list())).toHaveLength(1);
    expect((await service.reveal(second.id)).secret).toBe('sk-second-secret-0002');
  });

  it('过短密钥被拒绝', async () => {
    await expect(
      service.upsert({ name: 'x', provider: 'p', secret: 'short' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('删除后 reveal 404', async () => {
    const saved = await service.upsert({
      name: 'tmp',
      provider: 'p',
      secret: 'sk-tmp-secret-0003',
    });
    await service.remove(saved.id);
    await expect(service.reveal(saved.id)).rejects.toMatchObject({ status: 404 });
  });
});
