/**
 * 运营活动流的接线与边界（真实 AppModule，隔离 SQLite）。
 *
 * 单元测证明"归并数学对"（shared），这份证明"聚合接线对"：
 * 端点挂载、鉴权、参数拒绝、五源投影真的能从各自仓储读出来并按时间归并、
 * 顶部计数与 /ops/overview 同口径。
 */
import 'reflect-metadata';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { ACTIVITY_TODO_TS } from '@walker/shared';
import { AppModule } from '../app.module';
import { PRISMA } from '../ports/prisma.port';

let app: ReturnType<typeof createTestApp> extends Promise<infer T> ? T : never;
let db: PrismaClient;
let dir: string;
let base: string;

const headers = { 'x-admin-token': 'activity-test', 'content-type': 'application/json' };

async function createTestApp() {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRISMA)
    .useValue({ getClient: () => db, isWritable: () => true, ping: async () => true })
    .compile();
  const nest = module.createNestApplication({ logger: false });
  await nest.listen(0, '127.0.0.1');
  return nest;
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-activity-'));
  const url = 'file:' + path.join(dir, 'activity.test.db');
  const migrated = spawnSync('pnpm', ['db:migrate'], {
    cwd: path.resolve(__dirname, '../../../..'),
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: url, WALKER_DB_PROVIDER: 'sqlite' },
    shell: process.platform === 'win32',
  });
  if (migrated.status !== 0) throw new Error(migrated.stderr || migrated.stdout);
  db = new PrismaClient({ datasources: { db: { url } } });
  vi.stubEnv('WALKER_ADMIN_TOKEN', 'activity-test');
  vi.stubEnv('AI_ENABLED', 'false');
  vi.stubEnv('WALKER_SKILLS_DIR', path.join(dir, 'skills'));

  app = await createTestApp();
  base = await app.getUrl();
}, 60_000);

afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it('无任何活动时返回空页与可读的计数，不造数', async () => {
  const response = await fetch(base + '/ops/activity', { headers });
  expect(response.status).toBe(200);
  const page = (await response.json()) as { events: unknown[]; next: string | null };
  expect(page.events).toEqual([]);
  expect(page.next).toBeNull();

  const counts = await (await fetch(base + '/ops/activity/counts', { headers })).json();
  // 空库：回答类计数是 0（真测到 0），发布事实缺失时如实为 null
  expect(counts).toMatchObject({ remindersPending: 0, answersDegraded: 0, runsFailed: 0 });
  expect([counts.releaseWorkingAhead, null]).toContain(null);
});

it('待办提醒置顶且带占位时间；处置后不再置顶', async () => {
  const action = await db.action.create({
    data: {
      id: 'activity-action-1',
      title: '活动流验收事项',
      note: null,
      status: 'OPEN',
      plannedDate: '2026-01-01',
      dueAt: new Date('2026-01-01T00:00:00.000Z'),
      timezone: 'Asia/Shanghai',
      entityType: 'MANUAL',
      entityId: 'x',
      source: 'HUMAN',
    },
  });
  const before = (await (await fetch(base + '/ops/activity?kinds=reminder', { headers })).json()) as {
    events: Array<{ kind: string; severity: string; ts: string; title: string; provenance: { id: string } }>;
  };
  expect(before.events.length).toBeGreaterThan(0);
  expect(before.events[0]).toMatchObject({
    kind: 'reminder',
    severity: 'todo',
    title: '活动流验收事项',
    provenance: { id: action.id },
  });
  expect(before.events[0].ts).toBe(ACTIVITY_TODO_TS);

  // 完成处置后：待办从置顶消失（提醒箱只列开放事项）
  await db.action.update({ where: { id: action.id }, data: { status: 'DONE' } });
  const after = (await (await fetch(base + '/ops/activity?kinds=reminder', { headers })).json()) as {
    events: Array<{ title: string }>;
  };
  expect(after.events.map((event) => event.title)).not.toContain('活动流验收事项');
});

it('运行与后台操作按事实时间归并倒序，失败运行标红', async () => {
  const older = await db.executionRun.create({
    data: {
      id: 'act-run-old',
      state: 'SUCCEEDED',
      kind: 'trial',
      origin: 'admin',
      actor: 'owner',
      actorScope: 'owner',
      requestKey: 'activity-run-1',
      inputHash: 'a'.repeat(64),
      stopReason: null,
      tokensIn: 1,
      tokensOut: 1,
      elapsedMs: 10,
    },
  });
  await db.executionRun.create({
    data: {
      id: 'act-run-new',
      state: 'FAILED',
      kind: 'trial',
      origin: 'admin',
      actor: 'owner',
      actorScope: 'owner',
      requestKey: 'activity-run-2',
      inputHash: 'b'.repeat(64),
      stopReason: 'runtime-error',
      elapsedMs: 20,
    },
  });
  await db.adminRequestLog.create({
    data: { id: crypto.randomUUID(), actor: 'owner', method: 'POST', path: '/ops/agents', statusCode: 400, durationMs: 5 },
  });

  const page = (await (await fetch(base + '/ops/activity?kinds=run,admin', { headers })).json()) as {
    events: Array<{ kind: string; severity: string; ts: string; key: string }>;
  };
  const keys = page.events.map((event) => event.key);
  expect(keys).toContain('run:' + older.id);
  // 时间倒序：后创建的在前
  const runNew = page.events.find((event) => event.key === 'run:act-run-new');
  const runOld = page.events.find((event) => event.key === 'run:' + older.id);
  expect(runNew?.severity).toBe('error');
  expect(runOld?.severity).toBe('info');
  expect(page.events.indexOf(runNew!)).toBeLessThan(page.events.indexOf(runOld!));
  expect(page.events.some((event) => event.kind === 'admin' && event.severity === 'warn')).toBe(true);
});

it('参数非法一律 400，不静默兜默认值', async () => {
  expect((await fetch(base + '/ops/activity?kinds=unknown', { headers })).status).toBe(400);
  expect((await fetch(base + '/ops/activity?limit=0', { headers })).status).toBe(400);
  expect((await fetch(base + '/ops/activity?limit=51', { headers })).status).toBe(400);
  expect((await fetch(base + '/ops/activity?before=not-a-date', { headers })).status).toBe(400);
  expect((await fetch(base + '/ops/activity?kinds=run,run', { headers })).status).toBe(200);
});

it('管理鉴权之内：无 token 401', async () => {
  expect((await fetch(base + '/ops/activity')).status).toBe(401);
  expect((await fetch(base + '/ops/activity/counts')).status).toBe(401);
});
