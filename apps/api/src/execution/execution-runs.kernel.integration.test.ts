import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { READ_ONLY_PROFILE } from '@walker/shared';
import { AppModule } from '../app.module';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { RUNTIME_PORT, type RuntimePort } from '../ports/runtime.port';

const token = 'execution-runs-test';
const headers = { 'x-admin-token': token, 'content-type': 'application/json' };
const agentId = 'r15-agent';
const revisionId = 'r15-revision';
const runtimeState = { starts: 0, closes: 0, runs: 0, hold: null as Promise<void> | null };
const runtime: RuntimePort = {
  async start() {
    runtimeState.starts += 1;
    if (runtimeState.hold) await runtimeState.hold;
  },
  async run(request) {
    runtimeState.runs += 1;
    request.observe?.({ kind: 'text', text: '实际回答' });
    return {
      ok: true, sessionId: 'session-1', text: '实际回答', json: null, outputKind: 'json',
      usage: { inputTokens: 3, outputTokens: 5, cacheReadTokens: null },
    };
  },
  observe() { return () => undefined; },
  async close() {
    runtimeState.closes += 1;
    return { exited: true };
  },
};

let app: INestApplication;
let base: string;
let db: PrismaClient;
let moduleRef: TestingModule;

function post(path: string, body: unknown, auth: Record<string, string> = headers) {
  return fetch(base + path, { method: 'POST', headers: auth, body: JSON.stringify(body) });
}

beforeAll(async () => {
  vi.stubEnv('WALKER_ADMIN_TOKEN', token);
  vi.stubEnv('AI_ENABLED', 'false');
  moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RUNTIME_PORT).useValue(runtime).compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  db = app.get<PrismaPort>(PRISMA).getClient()!;
  await db.agentUnit.create({ data: { id: agentId, name: '试跑角色', prompt: '只读' } });
  await db.agentRevision.create({
    data: {
      id: revisionId, agentId, version: 1, prompt: '只读', modelId: 'deepseek-chat',
      toolProfile: READ_ONLY_PROFILE, schemaVersion: 1, configHash: 'b'.repeat(64),
    },
  });
});

afterAll(async () => {
  const runs = await db?.executionRun.findMany({ where: { actor: { in: ['owner', 'visitor'] } }, select: { id: true } });
  const ids = runs?.map((row) => row.id) ?? [];
  await db?.executionEvent.deleteMany({ where: { runId: { in: ids } } });
  await db?.processRecord.deleteMany({ where: { runId: { in: ids } } });
  await db?.executionQuotaHold.deleteMany({ where: { runId: { in: ids } } });
  await db?.executionRun.deleteMany({ where: { id: { in: ids } } });
  await db?.authorizationGrant.deleteMany({ where: { principalId: 'owner', agentId } });
  await db?.agentRevision.deleteMany({ where: { agentId } });
  await db?.agentUnit.deleteMany({ where: { id: agentId } });
  await app?.close();
  vi.unstubAllEnvs();
});

it('同一幂等键只产生一条运行，事件和用量来自实际调用', async () => {
  const grant = await (await post('/ops/grants', {
    requestKey: 'r15-grant-0001', level: 'L0', agentId,
    actions: ['agent:run'], resourceScope: { kind: 'agent', ids: [agentId] },
    expiresAt: '2099-01-01T00:00:00.000Z', runLimit: 5, usageLimit: 100,
  })).json() as { id: string };
  const body = {
    idempotencyKey: 'r15-run-0001', kind: 'chat', agentRevisionId: revisionId,
    input: '只读检查这一段', grantId: grant.id,
  };
  const first = await (await post('/ops/execution-runs', body)).json() as { id: string; idempotencyKey: string };
  const second = await (await post('/ops/execution-runs', body)).json() as { id: string };
  expect(second.id).toBe(first.id);
  expect(first.idempotencyKey).toBe('r15-run-0001');
  expect(await db.executionRun.count({ where: { requestKey: 'r15-run-0001' } })).toBe(1);
  await vi.waitFor(async () => {
    expect(await db.executionRun.findUnique({ where: { id: first.id } })).toMatchObject({ state: 'SUCCEEDED', tokensIn: 3, tokensOut: 5 });
  });
  const events = await (await fetch(`${base}/ops/execution-runs/${first.id}/events`, { headers })).json() as {
    items: Array<{ kind: string; text: string | null }>;
  };
  expect(events.items.map((item) => item.kind)).toEqual(['text', 'usage']);
  expect(events.items[0].text).toBe('实际回答');
  expect(JSON.stringify(events)).not.toContain('思维');
  const stream = await (await fetch(`${base}/ops/execution-runs/${first.id}/stream`, { headers })).text();
  expect(stream).toContain('event: text');
  expect(stream).toContain('实际回答');
  expect(stream).toContain('event: done');
  expect(stream).not.toContain('思维');
  const detail = await (await fetch(`${base}/ops/execution-runs/${first.id}`, { headers })).json();
  expect(detail).toMatchObject({ tokensIn: 3, input: '只读检查这一段' });
  const listed = await (await fetch(`${base}/ops/execution-runs?limit=1`, { headers })).json() as { items: Array<{ id: string }>; next: string | null };
  expect(listed.items).toHaveLength(1);
  expect(listed.next).toBe(listed.items[0].id);
});

it('匿名不能提交、查询或停止，其他来源的运行不可见', async () => {
  expect((await fetch(`${base}/ops/execution-runs`)).status).toBe(401);
  expect((await post('/ops/execution-runs', { idempotencyKey: 'r15-run-anon' }, { 'content-type': 'application/json' })).status).toBe(401);
  const hidden = 'r15-public-run';
  await db.executionRun.create({
    data: {
      id: hidden, kind: 'chat', origin: 'public', actor: 'visitor', actorScope: 'public:visitor',
      requestKey: 'r15-public-key', inputHash: 'c'.repeat(64), state: 'QUEUED',
    },
  });
  expect((await fetch(`${base}/ops/execution-runs/${hidden}`, { headers })).status).toBe(404);
  expect((await fetch(`${base}/ops/execution-runs/${hidden}/stream`, { headers })).status).toBe(404);
  expect((await fetch(`${base}/ops/execution-runs/${hidden}/stream`)).status).toBe(401);
  expect((await post(`/ops/execution-runs/${hidden}/stop`, {})).status).toBe(404);
  expect(await db.executionRun.findUnique({ where: { id: hidden } })).toMatchObject({ state: 'QUEUED' });
  expect(runtimeState.closes).toBe(0);
});

it('排队中的停止立刻终态，不关闭进程', async () => {
  const queuedId = 'r15-owned-queued';
  await db.executionRun.create({
    data: {
      id: queuedId, kind: 'chat', origin: 'admin', actor: 'owner', actorScope: 'admin:owner',
      agentRevisionId: revisionId, requestKey: 'r15-owned-queued', inputHash: 'd'.repeat(64),
      input: '仍在排队', state: 'QUEUED',
    },
  });
  const closes = runtimeState.closes;
  const stopped = await (await post(`/ops/execution-runs/${queuedId}/stop`, {})).json() as { state: string; stopReason: string };
  expect(stopped).toMatchObject({ state: 'CANCELLED', stopReason: 'user' });
  expect(runtimeState.closes).toBe(closes);
  const again = await (await post(`/ops/execution-runs/${queuedId}/stop`, {})).json() as { state: string };
  expect(again.state).toBe('CANCELLED');
  expect(await db.executionRun.findUnique({ where: { id: queuedId } })).toMatchObject({ state: 'CANCELLED', tokensIn: null });
});

it('伪造来源、错误修订或缺少授权不能创建运行', async () => {
  const before = await db.executionRun.count({ where: { actor: 'owner' } });
  expect((await post('/ops/execution-runs', {
    idempotencyKey: 'r15-run-forged', kind: 'chat', agentRevisionId: revisionId,
    input: '伪造来源', grantId: 'a'.repeat(64), origin: 'admin',
  })).status).toBe(400);
  expect((await post('/ops/execution-runs', {
    idempotencyKey: 'r15-run-missing', kind: 'chat', agentRevisionId: 'missing-revision',
    input: '不存在的修订', grantId: 'b'.repeat(64),
  })).status).toBe(403);
  expect(await db.executionRun.count({ where: { actor: 'owner' } })).toBe(before);
});
