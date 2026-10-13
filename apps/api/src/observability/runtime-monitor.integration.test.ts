/**
 * 运行监控的接线与 HTTP 边界（真实 AppModule，隔离 SQLite）。
 *
 * 为什么必须有这一层：单元测证明"缓冲数学对"，集成测证明"接线对"——
 * 端点挂在哪、参数校验走不走 HTTP、请求到底有没有被登记、query 有没有漏出去。
 * 采集侧调用与 main.ts 同一份 installRuntimeMonitoring，避免"测试通过但线上没数据"。
 */
import 'reflect-metadata';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { PRISMA } from '../ports/prisma.port';
import { installRuntimeMonitoring } from './runtime-monitoring';

let app: INestApplication;
let db: PrismaClient;
let dir: string;
let base: string;

const headers = { 'x-admin-token': 'runtime-monitor-test', 'content-type': 'application/json' };
/** 测试里不让终端刷屏，但采集仍然走同一条 tee 路径 */
const quietLogger = { log: () => {}, warn: () => {}, error: () => {}, fatal: () => {} };

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-runtime-monitor-'));
  const url = 'file:' + path.join(dir, 'runtime-monitor.test.db');
  const migrated = spawnSync('pnpm', ['db:migrate'], {
    cwd: path.resolve(__dirname, '../../../..'),
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: url, WALKER_DB_PROVIDER: 'sqlite' },
    shell: process.platform === 'win32',
  });
  if (migrated.status !== 0) throw new Error(migrated.stderr || migrated.stdout);
  db = new PrismaClient({ datasources: { db: { url } } });
  vi.stubEnv('WALKER_ADMIN_TOKEN', 'runtime-monitor-test');
  vi.stubEnv('AI_ENABLED', 'false');
  vi.stubEnv('WALKER_SKILLS_DIR', path.join(dir, 'skills'));

  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRISMA)
    .useValue({ getClient: () => db, isWritable: () => true, ping: async () => true })
    .compile();
  app = module.createNestApplication({ logger: false });
  installRuntimeMonitoring(app, { inner: quietLogger });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
}, 30_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it('运行日志：Nest Logger 的输出被采集，并按 context 归类到频道', async () => {
  new Logger('ContentReleaseService').log('集成测写入的一行');
  new Logger('HarnessAssistantAdapter').warn('集成测的降级提示');
  const response = await fetch(base + '/ops/runtime/logs?limit=200', { headers });
  expect(response.status).toBe(200);
  const page = (await response.json()) as {
    entries: Array<{ channel: string; level: string; text: string; ts: string }>;
    counts: Record<string, number>;
    dropped: number;
  };
  const texts = page.entries.map((entry) => entry.text);
  expect(texts).toContain('集成测写入的一行');
  expect(texts).toContain('集成测的降级提示');
  expect(page.entries.find((entry) => entry.text === '集成测写入的一行')?.channel).toBe('task');
  expect(page.entries.find((entry) => entry.text === '集成测的降级提示')?.channel).toBe('chat');
  expect(page.counts.task).toBeGreaterThan(0);
  expect(page.dropped).toBe(0);
});

it('请求指标：真实请求被登记为路由模板，query 不外泄', async () => {
  expect((await fetch(base + '/ops/capabilities?secret=never-log', { headers })).status).toBe(200);
  const response = await fetch(base + '/ops/runtime/requests?limit=50', { headers });
  expect(response.status).toBe(200);
  const page = (await response.json()) as {
    entries: Array<{ method: string; route: string; status: number; outcome: string; durationMs: number }>;
  };
  expect(page.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ method: 'GET', route: '/ops/capabilities', status: 200, outcome: 'success' }),
    ]),
  );
  // 只记路由模板：查询串永远不出现在记录里
  expect(JSON.stringify(page)).not.toMatch(/never-log|secret/);
  for (const entry of page.entries) {
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry.route).not.toContain('?');
  }
});

it('请求指标：口径只算有真实 HTTP 结果的请求，进行中计数不累积', async () => {
  type Metrics = {
    completed: number; failed: number; interrupted: number; inFlight: number;
    successRate: number | null; avgDurationMs: number | null; droppedLogLines: number;
  };
  const read = async (): Promise<Metrics> => {
    const response = await fetch(base + '/ops/runtime/metrics', { headers });
    expect(response.status).toBe(200);
    return (await response.json()) as Metrics;
  };
  const first = await read();
  const second = await read();

  expect(first.completed).toBeGreaterThan(0);
  // 读指标这一次请求**本身**就在进行中，所以是 1 而不是 0（诚实计数，不是 bug）。
  // 关键是两次读数相同、且不随轮询增长——那才说明 begin/finish 没有漏配对。
  expect(second.inFlight).toBe(first.inFlight);
  expect(second.inFlight).toBeLessThanOrEqual(1);
  // 第一次读指标的那次请求此时已结束，所以 completed 必须增长
  expect(second.completed).toBeGreaterThan(first.completed);
  expect(second.interrupted).toBeGreaterThanOrEqual(0);
  expect(second.successRate === null || (second.successRate >= 0 && second.successRate <= 1)).toBe(true);
  expect(second.avgDurationMs === null || second.avgDurationMs >= 0).toBe(true);
});

it('人工操作与自动轮询在服务端分开：humanOnly 只留下人工触发的请求', async () => {
  // 前端轮询带 x-admin-background-poll: 1；人工操作不带（判据与后台日志共用一份实现）
  await fetch(base + '/ops/runtime/metrics', {
    headers: { ...headers, 'x-admin-background-poll': '1' },
  });
  const human = (await (
    await fetch(base + '/ops/runtime/requests?limit=50&humanOnly=1', { headers })
  ).json()) as { entries: Array<{ background: boolean }> };
  expect(human.entries.length).toBeGreaterThan(0);
  expect(human.entries.every((entry) => entry.background === false)).toBe(true);

  const all = (await (
    await fetch(base + '/ops/runtime/requests?limit=50', { headers })
  ).json()) as { entries: Array<{ background: boolean }> };
  expect(all.entries.some((entry) => entry.background === true)).toBe(true);
});

it('参数非法或频道不认识返回 400，不静默兜默认值', async () => {
  expect((await fetch(base + '/ops/runtime/requests?limit=0', { headers })).status).toBe(400);
  expect((await fetch(base + '/ops/runtime/requests?limit=999', { headers })).status).toBe(400);
  expect((await fetch(base + '/ops/runtime/logs?ch=unknown', { headers })).status).toBe(400);
  expect((await fetch(base + '/ops/runtime/logs?ch=task&limit=5', { headers })).status).toBe(200);
});

it('运行监控端点同样在管理鉴权之内', async () => {
  expect((await fetch(base + '/ops/runtime/metrics')).status).toBe(401);
  expect((await fetch(base + '/ops/runtime/logs')).status).toBe(401);
});

it('轮询这些端点不写后台日志（不污染审计）', async () => {
  const before = await db.adminRequestLog.count();
  expect((await fetch(base + '/ops/runtime/metrics', { headers: { ...headers, 'x-admin-background-poll': '1' } })).status).toBe(200);
  expect(await db.adminRequestLog.count()).toBe(before);
});
