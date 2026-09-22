import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { READ_ONLY_PROFILE } from '@walker/shared';
import { AppModule } from '../app.module';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { RUNTIME_PORT, type RuntimePort } from '../ports/runtime.port';

const token = 'legacy-execution-token';
const headers = { 'x-admin-token': token, 'content-type': 'application/json' };
const agentId = 'r18-agent';
const revisionId = 'r18-revision';
const runtime: RuntimePort = {
  async start() {},
  async run(request) {
    request.observe?.({ kind: 'text', text: '统一回答' });
    return { ok: true, sessionId: 's', text: '统一回答', json: null, outputKind: 'json', usage: { inputTokens: 2, outputTokens: 3, cacheReadTokens: null } };
  },
  observe() { return () => undefined; },
  async close() { return { exited: true }; },
};
let app: INestApplication;
let base: string;
let db: PrismaClient;

beforeAll(async () => {
  vi.stubEnv('WALKER_ADMIN_TOKEN', token);
  vi.stubEnv('AI_ENABLED', 'false');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RUNTIME_PORT).useValue(runtime).compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  db = app.get<PrismaPort>(PRISMA).getClient()!;
  await db.agentUnit.create({ data: { id: agentId, name: '统一执行', prompt: '只读', modelId: 'deepseek-chat' } });
  await db.agentRevision.create({ data: { id: revisionId, agentId, version: 1, prompt: '只读', modelId: 'deepseek-chat', toolProfile: READ_ONLY_PROFILE, schemaVersion: 1, configHash: 'a'.repeat(64) } });
});

afterAll(async () => {
  const runs = await db?.executionRun.findMany({ where: { agentRevisionId: revisionId }, select: { id: true } });
  const ids = runs?.map((row) => row.id) ?? [];
  await db?.executionEvent.deleteMany({ where: { runId: { in: ids } } });
  await db?.processRecord.deleteMany({ where: { runId: { in: ids } } });
  await db?.executionQuotaHold.deleteMany({ where: { runId: { in: ids } } });
  await db?.executionRun.deleteMany({ where: { id: { in: ids } } });
  await db?.authorizationGrant.deleteMany({ where: { agentId } });
  await db?.agentRevision.deleteMany({ where: { agentId } });
  await db?.agentUnit.deleteMany({ where: { id: agentId } });
  await app?.close();
  vi.unstubAllEnvs();
});

async function post(path: string, body: unknown) {
  return fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
}

it('旧 try 和 compare 走统一执行，不能绕过授权，也不写第二份运行', async () => {
  const beforeRuns = await db.agentRun.count({ where: { agentId } });
  expect((await post(`/agents/${agentId}/try`, { input: '只读检查' })).status).toBe(403);
  expect(await db.executionRun.count({ where: { agentRevisionId: revisionId } })).toBe(0);
  const grant = await (await post('/ops/grants', {
    requestKey: 'r18-grant-0001', level: 'L0', agentId, actions: ['agent:run'],
    resourceScope: { kind: 'agent', ids: [agentId] }, expiresAt: '2099-01-01T00:00:00.000Z', runLimit: 4, usageLimit: 100,
  })).json() as { id: string };
  const tried = await (await post(`/agents/${agentId}/try`, { input: '只读检查' })).json() as { output: string };
  expect(tried.output).toBe('统一回答');
  expect(await db.executionRun.count({ where: { agentRevisionId: revisionId } })).toBe(1);
  expect(await db.agentRun.count({ where: { agentId } })).toBe(beforeRuns);
  expect((await post(`/agents/${agentId}/try`, { input: '换模型', modelId: 'other-model' })).status).toBe(403);
  const compared = await (await post(`/agents/${agentId}/compare`, { input: '对比问题', targets: [{ label: '甲' }, { label: '乙' }] })).json() as { results: Array<{ output?: string }> };
  expect(compared.results).toHaveLength(2);
  expect(compared.results.every((item) => item.output === '统一回答')).toBe(true);
  expect(await db.executionRun.count({ where: { agentRevisionId: revisionId } })).toBe(3);
  expect(grant.id).toHaveLength(64);
});
