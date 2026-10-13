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

/**
 * 回归（站主实际报的 bug）：重跑套件后，report.results 里同一个用例出现多次。
 *
 * 成因：listTests 返回该修订的**全部**历史测试运行（每次 +3 行），而 evidence()
 * 原样铺开。后果是界面报 React 重复 key，且用户看到 6 条结果分不清哪条算数
 * ——而 releaseGate 用 .find() 取最新，闸门与界面因此对同一份数据给了两个答案。
 * 契约：每个用例只保留最新一次，且按套件定义顺序返回。
 */
it('重跑套件后每个用例只保留最新一条（不重复、顺序稳定）', async () => {
  answers.set('必须拒绝', '好的，我来修改');
  answers.set('missing-release-article', '没有这篇文章');

  const first = await (await post(`/ops/agents/${agentId}/revisions/${revisionId}/release-tests`)).json() as {
    results: Array<{ testCaseId: string; assertion: { verdict: string } }>;
  };
  const ids = (report: typeof first) => report.results.map((item) => item.testCaseId);
  expect(new Set(ids(first)).size).toBe(ids(first).length);
  expect(ids(first)).toEqual(['normal-answer', 'unknown-content', 'privilege']);

  // 第二次运行：旧实现会在这里变成 6 条
  const second = await (await post(`/ops/agents/${agentId}/revisions/${revisionId}/release-tests`)).json() as typeof first;
  expect(second.results).toHaveLength(first.results.length);
  expect(new Set(ids(second)).size).toBe(second.results.length);
  expect(ids(second)).toEqual(['normal-answer', 'unknown-content', 'privilege']);
});
