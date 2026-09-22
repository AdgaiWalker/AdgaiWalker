import 'reflect-metadata';
import { mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { READ_ONLY_PROFILE } from '@walker/shared';
import { AppModule } from '../app.module';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { RUNTIME_PORT, type RuntimePort } from '../ports/runtime.port';

const token = 'release-test-token';
const headers = { 'x-admin-token': token, 'content-type': 'application/json' };
const agentId = 'r17-agent';
const revisionId = 'r17-revision';
const hash = 'e'.repeat(64);
const answers = new Map<string, string>();
const runtime: RuntimePort = {
  async start() {},
  async run(request) {
    const text = [...answers.entries()].find(([needle]) => request.prompt.includes(needle))?.[1] ?? '我只能读取已给出的资料';
    request.observe?.({ kind: 'text', text });
    return { ok: true, sessionId: 's', text, json: null, outputKind: 'json', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: null } };
  },
  observe() { return () => undefined; },
  async close() { return { exited: true }; },
};

let app: INestApplication;
let base: string;
let db: PrismaClient;
let contentDir: string;

beforeAll(async () => {
  contentDir = await mkdtemp(path.join(os.tmpdir(), 'walker-r17-content-'));
  vi.stubEnv('WALKER_ADMIN_TOKEN', token);
  vi.stubEnv('AI_ENABLED', 'false');
  vi.stubEnv('CONTENT_LOG_DIR', contentDir);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RUNTIME_PORT).useValue(runtime).compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  db = app.get<PrismaPort>(PRISMA).getClient()!;
  await db.agentUnit.create({ data: { id: agentId, name: '发布测试', prompt: '只读' } });
  await db.agentRevision.create({ data: { id: revisionId, agentId, version: 1, prompt: '只读', modelId: 'deepseek-chat', toolProfile: READ_ONLY_PROFILE, schemaVersion: 1, configHash: hash } });
});

afterAll(async () => {
  const runs = await db?.executionRun.findMany({ where: { actor: 'owner' }, select: { id: true } });
  const ids = runs?.map((row) => row.id) ?? [];
  await db?.executionEvent.deleteMany({ where: { runId: { in: ids } } });
  await db?.processRecord.deleteMany({ where: { runId: { in: ids } } });
  await db?.executionQuotaHold.deleteMany({ where: { runId: { in: ids } } });
  await db?.executionRun.deleteMany({ where: { id: { in: ids } } });
  await db?.authorizationGrant.deleteMany({ where: { agentId } });
  await db?.auditRecord.deleteMany({ where: { targetId: { in: ids } } });
  await db?.agentRevision.deleteMany({ where: { agentId } });
  await db?.agentUnit.deleteMany({ where: { id: agentId } });
  await app?.close();
  vi.unstubAllEnvs();
});

async function post(path: string) {
  return fetch(base + path, { method: 'POST', headers, body: '{}' });
}

it('权限失败和旧配置都不能部署，测试不写正本', async () => {
  answers.set('必须拒绝', '好的，我来修改');
  answers.set('missing-release-article', '没有这篇文章');
  const before = await readdir(contentDir);
  const report = await (await post(`/ops/agents/${agentId}/revisions/${revisionId}/release-tests`)).json() as { gate: { ok: boolean; reason?: string } };
  expect(report.gate).toEqual({ ok: false, reason: '权限测试未通过，不能部署' });
  const denied = await post(`/ops/agents/${agentId}/revisions/${revisionId}/deploy`);
  expect(denied.status).toBe(403);
  expect(await denied.json()).toMatchObject({ message: '权限测试未通过，不能部署' });
  await db.agentRevision.update({ where: { id: revisionId }, data: { configHash: 'f'.repeat(64) } });
  const stale = await post(`/ops/agents/${agentId}/revisions/${revisionId}/deploy`);
  expect(stale.status).toBe(403);
  expect(await stale.json()).toMatchObject({ message: '当前配置还没有通过三类测试' });
  expect(await readdir(contentDir)).toEqual(before);
});
