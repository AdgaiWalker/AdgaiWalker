import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, expect, it } from 'vitest';
import { PrismaAgentExecutionRepository } from '../adapters/prisma-agent-execution.repository';
import { RunRetentionService } from './run-retention.service';

const db = new PrismaClient();
const runs = new PrismaAgentExecutionRepository({ getClient: () => db } as never);
const service = new RunRetentionService(runs);
const runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-retention-'));
const contentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-content-'));
const secret = 'sk-retention-secret';

afterAll(async () => {
  await db.conversationLogResource.deleteMany({ where: { resourceKey: { in: ['expired-test', 'keep-chat'] } } });
  await db.conversationLogResource.deleteMany({ where: { parentKey: { in: ['expired-test', 'keep-chat'] } } });
  await db.executionRun.deleteMany({ where: { id: { in: ['keep-chat', 'expired-test'] } } });
  await db.$disconnect();
  fs.rmSync(runsDir, { recursive: true, force: true });
  fs.rmSync(contentDir, { recursive: true, force: true });
});

it('只清理到期的后台试跑诊断，不删其他运行和站主内容', async () => {
  fs.writeFileSync(path.join(runsDir, 'probe.log'), secret);
  fs.writeFileSync(path.join(contentDir, 'post.md'), '站主正文');
  await db.executionRun.create({
    data: {
      id: 'expired-test', kind: 'test', origin: 'admin', actor: 'owner', actorScope: 'admin:owner',
      requestKey: 'expired-test-key', inputHash: 'a'.repeat(64), state: 'SUCCEEDED',
      retainUntil: new Date('2000-01-01T00:00:00.000Z'), diagnosticName: 'probe.log',
    },
  });
  await db.conversationLogResource.create({ data: {
    conversationId: null, resourceType: 'execution-run', resourceKey: 'expired-test',
    resourceCreatedAt: new Date('2000-01-01T00:00:00.000Z'),
  } });
  await db.conversationLogResource.create({ data: {
    conversationId: null, resourceType: 'execution-event', resourceKey: 'expired-test:1', parentKey: 'expired-test',
    resourceCreatedAt: new Date('2000-01-01T00:00:00.000Z'),
  } });
  await db.executionRun.create({
    data: {
      id: 'keep-chat', kind: 'chat', origin: 'admin', actor: 'owner', actorScope: 'admin:owner',
      requestKey: 'keep-chat-key', inputHash: 'b'.repeat(64), state: 'SUCCEEDED',
    },
  });
  const report = await service.cleanup(runsDir, new Date('2026-09-22T00:00:00.000Z'));
  expect(report.removed).toEqual([{ id: 'expired-test', diagnosticName: 'probe.log' }]);
  expect(JSON.stringify(report)).not.toContain(secret);
  expect(JSON.stringify(report)).not.toContain(runsDir);
  expect(await db.executionRun.findUnique({ where: { id: 'expired-test' } })).toBeNull();
  expect(await db.executionRun.findUnique({ where: { id: 'keep-chat' } })).not.toBeNull();
  expect(await db.conversationLogResource.findMany({ where: { resourceKey: 'expired-test' } })).toEqual([]);
  expect(await db.conversationLogResource.findMany({ where: { parentKey: 'expired-test' } })).toEqual([]);
  expect(fs.existsSync(path.join(runsDir, 'probe.log'))).toBe(false);
  expect(fs.readFileSync(path.join(contentDir, 'post.md'), 'utf8')).toBe('站主正文');
});
