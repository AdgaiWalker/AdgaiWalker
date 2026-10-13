import { SITE_CONTENT_INDEX } from '../ports/site-content-index.port';
import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { PRISMA } from '../ports/prisma.port';
import { READ_ONLY_PROFILE } from '@walker/shared';
import { DEFAULT_AGENT_MODEL_ID } from './agent-unit.service';

let app: INestApplication, db: PrismaClient, dir: string, base: string;
const headers = { 'x-admin-token': 'catalog-test', 'content-type': 'application/json' };
beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-catalog-test-'));
  const url = `file:${path.join(dir, 'catalog.test.db')}`;
  const migrated = spawnSync('pnpm', ['db:migrate'], {
    cwd: path.resolve(__dirname, '../../../..'), encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: url, WALKER_DB_PROVIDER: 'sqlite' },
    shell: process.platform === 'win32',
  });
  if (migrated.status !== 0) throw new Error(migrated.stderr || migrated.stdout);
  db = new PrismaClient({ datasources: { db: { url } } });
  vi.stubEnv('WALKER_ADMIN_TOKEN', 'catalog-test');
  vi.stubEnv('AI_ENABLED', 'false');
  vi.stubEnv('WALKER_SKILLS_DIR', path.join(dir, 'skills'));
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PRISMA)
    .useValue({ getClient: () => db, isWritable: () => true, ping: async () => true })
    .overrideProvider(SITE_CONTENT_INDEX).useValue({
      loadCitable: async () => [{ slug: 'post-a' }, { slug: 'post-b' }],
      loadCitableFull: async () => [],
      loadCitableSnapshot: async () => ({ buildId: 'test-build', collectionHash: 'd'.repeat(64), entries: [] }),
    }).compile();
  app = module.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
}, 30_000);
afterAll(async () => { await app?.close(); await db?.$disconnect(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });

it('后台日志覆盖读取与失败操作，不保存查询参数或请求体', async () => {
  expect((await fetch(`${base}/ops/capabilities?secret=never-log`, { headers })).status).toBe(200);
  expect((await fetch(`${base}/ops/agents/secret-path-value?secret=never-log`, { headers })).status).toBe(404);
  expect((await fetch(`${base}/ops/agents`, {
    method: 'POST', headers, body: JSON.stringify({ secret: 'body-never-log' }),
  })).status).toBe(400);
  const response = await fetch(`${base}/ops/admin-log?limit=50`, { headers });
  expect(response.status).toBe(200);
  const data = await response.json() as { items: Array<{ method: string; path: string; statusCode: number }> };
  expect(data.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ method: 'GET', path: '/ops/capabilities', statusCode: 200 }),
    expect.objectContaining({ method: 'POST', path: '/ops/agents', statusCode: 400 }),
  ]));
  expect(JSON.stringify(data)).not.toMatch(/never-log|body-never-log|secret-path-value/);
});

it('后台日志无法写入时拒绝执行管理操作', async () => {
  await db.$executeRawUnsafe(`CREATE TRIGGER "reject_admin_log" BEFORE INSERT ON "AdminRequestLog" BEGIN SELECT RAISE(ABORT, 'log-failed'); END`);
  try {
    const response = await fetch(`${base}/ops/agents`, { method: 'POST', headers, body: JSON.stringify({
      requestKey: 'audit-failure-agent', baseVersion: 0, name: '不应创建', prompt: '测试',
      providerId: null, modelId: DEFAULT_AGENT_MODEL_ID, toolProfile: READ_ONLY_PROFILE,
    }) });
    expect(response.status).toBe(503);
    expect(await db.agentUnit.count({ where: { name: '不应创建' } })).toBe(0);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "reject_admin_log"`);
  }
});

it('后台自动轮询不产生人工操作日志', async () => {
  const before = await db.adminRequestLog.count();
  expect((await fetch(`${base}/ops/capabilities`, { headers: { ...headers, 'x-admin-background-poll': '1' } })).status).toBe(200);
  expect(await db.adminRequestLog.count()).toBe(before);
  expect((await fetch(`${base}/ops/agents`, {
    method: 'POST', headers: { ...headers, 'x-admin-background-poll': '1' }, body: '{}',
  })).status).toBe(400);
  expect(await db.adminRequestLog.count()).toBe(before + 1);
});

it('修订保存与审计原子提交，旧版本不变，重复请求不增版本，旧写路径退役', async () => {
  // 未连接供应商的草稿只能保留系统默认模型（DEFAULT_AGENT_MODEL_ID）。
  const config = { requestKey: 'catalog-request-1', baseVersion: 0, name: '测试角色', prompt: '第一版', providerId: null, modelId: DEFAULT_AGENT_MODEL_ID, toolProfile: READ_ONLY_PROFILE };
  expect((await fetch(`${base}/ops/agents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(config) })).status).toBe(401);
  const create = () => fetch(`${base}/ops/agents`, { method: 'POST', headers, body: JSON.stringify(config) });
  const response = await create();
  expect(response.status).toBe(201);
  const first = await response.json();
  expect(await (await create()).json()).toMatchObject({ id: first.id, version: 1 });
  const second = await fetch(`${base}/ops/agents/${first.agentId}/revisions`, {
    method: 'POST', headers, body: JSON.stringify({ ...config, requestKey: 'catalog-request-2', baseVersion: 1, prompt: '第二版' }),
  });
  expect(second.status).toBe(201);
  const detail = await (await fetch(`${base}/ops/agents/${first.agentId}`, { headers })).json();
  expect(detail.revisions.map((item: { prompt: string }) => item.prompt)).toEqual(['第二版', '第一版']);
  expect(await db.auditRecord.count({ where: { targetId: first.agentId } })).toBe(2);
  expect(fs.existsSync(path.join(dir, 'skills'))).toBe(false);
  expect((await fetch(`${base}/agents`, { method: 'POST', headers, body: JSON.stringify(config) })).status).toBe(404);
  expect((await fetch(`${base}/ops/agents/${first.agentId}/revisions/${first.id}`, { method: 'PATCH', headers, body: '{}' })).status).toBe(404);
  const exported = await (await fetch(`${base}/ops/agents/${first.agentId}/revisions/${first.id}/export`, { headers })).json();
  expect(exported.markdown).toContain('第一版');
  expect(exported.markdown).not.toContain('第二版');
  await fetch(`${base}/ops/agents/${first.agentId}/archive`, { method: 'POST', headers });
  expect(await db.agentRevision.count({ where: { agentId: first.agentId } })).toBe(2);
});

it('历史角色导入幂等；无效模型或工具配置拒绝保存', async () => {
  await db.agentUnit.create({ data: { id: 'legacy-test', name: '旧角色', prompt: '旧提示' } });
  const imported = await fetch(`${base}/ops/agents/import-legacy`, { method: 'POST', headers });
  expect(await imported.json()).toEqual({ imported: 1 });
  expect(await (await fetch(`${base}/ops/agents/import-legacy`, { method: 'POST', headers })).json()).toEqual({ imported: 0 });
  const invalid = { requestKey: 'invalid-request-1', baseVersion: 1, name: '旧角色', prompt: '新提示', providerId: 'missing', modelId: 'made-up', toolProfile: READ_ONLY_PROFILE };
  expect((await fetch(`${base}/ops/agents/legacy-test/revisions`, { method: 'POST', headers, body: JSON.stringify(invalid) })).status).toBe(400);
  expect(await db.agentRevision.count({ where: { agentId: 'legacy-test' } })).toBe(1);
});

it('授权审计失败回滚，重复创建/撤销幂等，匿名不能授权', async () => {
  const { createHash } = await import('node:crypto');
  const { AuthorizationService } = await import('../authorization/authorization.service');
  const input = { requestKey: 'grant-http-request', level: 'L2', agentId: 'legacy-test', actions: ['content:apply'], resourceScope: { kind: 'content', ids: ['post-a'] }, expiresAt: '2099-01-01T00:00:00.000Z', runLimit: 1, usageLimit: 1000 };
  const issue = (body = input, authenticated = true) => fetch(`${base}/ops/grants`, { method: 'POST', headers: authenticated ? headers : { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  expect((await issue(input, false)).status).toBe(401);
  const id = createHash('sha256').update(`owner\0${input.requestKey}`).digest('hex');
  await db.auditRecord.create({ data: { id: `grant-issue-${id}`, actor: 'test', action: 'test', targetType: 'test', targetId: id, outcome: 'test' } });
  expect((await issue()).status).toBe(500);
  expect(await db.authorizationGrant.count({ where: { id } })).toBe(0);
  await db.auditRecord.delete({ where: { id: `grant-issue-${id}` } });
  expect((await issue()).status).toBe(201);
  expect(await (await issue()).json()).toMatchObject({ id, revision: 1, actions: ['content:apply'] });
  expect((await issue({ ...input, usageLimit: 2000 })).status).toBe(409);
  const service = app.get(AuthorizationService);
  const request = { origin: 'admin' as const, principalType: 'owner', principalId: 'owner', agentId: input.agentId, action: 'content:apply' as const, resourceKind: 'content' as const, resourceId: 'post-a', now: Date.now() };
  expect(await service.require(id, request)).toMatchObject({ id });
  await expect(service.require(id, { ...request, origin: 'public' })).rejects.toThrow('当前事项未获授权');
  for (let i = 0; i < 2; i++) expect((await fetch(`${base}/ops/grants/${id}/revoke`, { method: 'POST', headers })).status).toBe(201);
  expect(await db.authorizationGrant.findUnique({ where: { id } })).toMatchObject({ revision: 2 });
  expect(await db.auditRecord.count({ where: { targetId: id } })).toBe(2);
  await expect(service.require(id, request)).rejects.toThrow('当前事项未获授权');
  expect(await (await issue()).json()).toMatchObject({ revision: 2 });
});

it('执行准入拒绝伪造来源、换授权、换对象与子任务扩大范围', async () => {
  const { AgentExecutionService } = await import('../execution/agent-execution.service');
  const { AuthorizationService } = await import('../authorization/authorization.service');
  const revision = await db.agentRevision.findFirstOrThrow({ where: { agentId: 'legacy-test' } });
  const service = app.get(AgentExecutionService);
  const grant = await app.get(AuthorizationService).issue({ requestKey: 'preflight-grant', level: 'L0', agentId: 'legacy-test', actions: ['agent:run', 'content:read'], resourceScope: { kind: 'content', ids: ['post-a', 'post-b', 'hidden-post'] }, expiresAt: '2099-01-01T00:00:00.000Z', runLimit: 5, usageLimit: 10000 }, 'owner');
  const input = { requestKey: 'preflight-input', agentRevisionId: revision.id, kind: 'file', targetId: 'post-a', input: '只读分析' };
  const context = { origin: 'admin' as const, principalType: 'owner' as const, principalId: 'owner', agentId: 'legacy-test', grantId: grant.id };
  expect(await service.preflight(input, context)).toMatchObject({ resourceScope: { kind: 'content', ids: ['post-a'] }, grantRevision: 1 });
  await expect(service.preflight({ ...input, origin: 'admin' }, context)).rejects.toThrow('运行请求字段无效');
  await expect(service.preflight(input, { ...context, grantId: 'unknown' })).rejects.toThrow('当前请求不允许执行');
  await expect(service.preflight(input, { ...context, principalId: 'other' })).rejects.toThrow('当前请求不允许执行');
  await expect(service.preflight({ ...input, targetId: 'hidden-post' }, context)).rejects.toThrow('当前请求不允许执行');
  await expect(service.preflight(input, { ...context, origin: 'public', principalType: 'visitor' })).rejects.toThrow('当前请求不允许执行');
  await db.executionRun.create({ data: { id: 'parent-policy', actor: 'owner', actorScope: 'owner', origin: 'admin', kind: 'file', requestKey: 'parent-policy', inputHash: 'a'.repeat(64), state: 'RUNNING', agentRevisionId: revision.id, grantId: grant.id, resourceScope: { kind: 'content', ids: ['post-a'] } } });
  expect(await service.preflight(input, { ...context, parentRunId: 'parent-policy' })).toMatchObject({ grantRevision: 1 });
  await expect(service.preflight({ ...input, targetId: 'post-b' }, { ...context, parentRunId: 'parent-policy' })).rejects.toThrow('当前请求不允许执行');
  expect(await db.executionRun.count()).toBe(1); // preflight 没有绕过调度器创建运行。
});
