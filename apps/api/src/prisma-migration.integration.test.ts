import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../..');

function command(name: 'db:migrate' | 'db:baseline', file: string) {
  return spawnSync('pnpm', [name], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: `file:${file}`, WALKER_DB_PROVIDER: 'sqlite' },
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
}

describe('SQLite 版本迁移', () => {
  it('空库部署可重复，现有库保留数据后才能建立基线，漂移拒绝推进', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-migrate-test-'));
    const fresh = path.join(dir, 'fresh.db');
    const existing = path.join(dir, 'existing.db');
    let client: PrismaClient | undefined;
    try {
      expect(command('db:migrate', fresh).status).toBe(0);
      expect(command('db:migrate', fresh).status).toBe(0);

      fs.closeSync(fs.openSync(existing, 'wx'));
      const pushed = spawnSync('pnpm', [
        'exec', 'prisma', 'db', 'execute', '--url', `file:${existing}`,
        '--file', 'prisma/migrations/20260922000000_sqlite_baseline/migration.sql',
      ], {
        cwd: path.join(root, 'apps/api'),
        env: { ...process.env, DATABASE_URL: `file:${existing}` },
        encoding: 'utf8',
        shell: process.platform === 'win32',
      });
      expect(pushed.status, pushed.stderr).toBe(0);
      client = new PrismaClient({ datasources: { db: { url: `file:${existing}` } } });
      await client.likeCounter.create({ data: { path: '/migration-evidence', count: 7 } });
      await client.$executeRawUnsafe(
        "INSERT INTO AgentUnit (id, name, icon, isSystem, modelId, prompt, createdAt, updatedAt) VALUES ('old-agent', '旧角色', 'bot', 0, 'deepseek-chat', '旧提示', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
      );
      await client.$executeRawUnsafe(
        "INSERT INTO AgentRun (id, agentId, instruction, output, model, createdAt) VALUES ('old-run', 'old-agent', '旧输入', '旧输出', 'deepseek-chat', CURRENT_TIMESTAMP)",
      );
      await client.$disconnect();
      client = undefined;

      expect(command('db:migrate', existing).status).not.toBe(0);
      expect(command('db:baseline', existing).status).toBe(0);
      expect(command('db:baseline', existing).status).toBe(0);
      client = new PrismaClient({ datasources: { db: { url: `file:${existing}` } } });
      expect((await client.likeCounter.findUnique({ where: { path: '/migration-evidence' } }))?.count).toBe(7);
      expect((await client.agentRun.findUnique({ where: { id: 'old-run' } }))?.output).toBe('旧输出');
      await expect(client.agentUnit.delete({ where: { id: 'old-agent' } })).rejects.toThrow();
      expect(await client.agentRun.count({ where: { id: 'old-run' } })).toBe(1);
      expect(await client.agentRevision.count()).toBe(0);
      const revision = await client.agentRevision.create({
        data: {
          id: 'revision-1', agentId: 'old-agent', version: 1, prompt: '旧提示',
          modelId: 'deepseek-chat', toolProfile: {}, schemaVersion: 1, configHash: 'hash-1',
        },
      });
      await expect(client.agentRevision.create({
        data: {
          id: 'revision-duplicate', agentId: 'old-agent', version: 1, prompt: '新提示',
          modelId: 'deepseek-chat', toolProfile: {}, schemaVersion: 1, configHash: 'hash-2',
        },
      })).rejects.toThrow();
      const run = {
        kind: 'TEST', origin: 'ADMIN', actor: 'owner', actorScope: 'owner',
        agentRevisionId: revision.id, requestKey: 'same-request', inputHash: 'a'.repeat(64),
      };
      await client.executionRun.create({ data: { id: 'run-1', ...run } });
      await expect(client.executionRun.create({ data: { id: 'run-duplicate', ...run } })).rejects.toThrow();
      await client.$executeRawUnsafe('ALTER TABLE AgentUnit ADD COLUMN unexpected TEXT');
      await client.$disconnect();
      client = undefined;
      const rejected = command('db:migrate', existing);
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain('拒绝修改数据库');
    } finally {
      await client?.$disconnect();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
