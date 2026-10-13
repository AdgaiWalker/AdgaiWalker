import 'reflect-metadata';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

const token = 'o01-http-token';
const authHeaders = { 'x-admin-token': token, 'content-type': 'application/json' };

let app: INestApplication;
let base: string;
let contentDir: string;
let moduleRef: TestingModule;

describe('O01 提醒与复盘的 HTTP 出口（管理鉴权）', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-o01-http-'));
    process.env.WALKER_ADMIN_TOKEN = token;
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.AI_ENABLED = 'false';

    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    const db = app?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.reminderOccurrence.deleteMany({ where: { actionId: { startsWith: 'o01-http-' } } });
      await db.reviewEntry.deleteMany({ where: { actionId: { startsWith: 'o01-http-' } } });
      await db.action.deleteMany({ where: { id: { startsWith: 'o01-http-' } } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    delete process.env.WALKER_ADMIN_TOKEN;
    delete process.env.CONTENT_LOG_DIR;
  });

  it('到期换算预览端点可用，且匿名访问被拦截', async () => {
    const anon = await fetch(`${base}/ops/reminders/resolve-due`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plannedDate: '2026-09-26' }),
    });
    expect(anon.status).toBe(401);

    const res = await fetch(`${base}/ops/reminders/resolve-due`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ plannedDate: '2026-09-26' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { dueAt: string; timezone: string; source: string };
    expect(body.dueAt).toBe('2026-09-25T16:00:00.000Z');
    expect(body.timezone).toBe('Asia/Shanghai');
    expect(body.source).toBe('date');
  });

  it('活动事项→发生记录→复盘 全链经 HTTP 走通', async () => {
    // 经既有 Action 接口创建带排期的事项（会经共享规则推导 dueAt）
    const created = await fetch(`${base}/actions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ title: 'o01-http-排期事项', plannedDate: '2026-09-26' }),
    });
    expect(created.status).toBe(201);
    const action = await created.json() as { id: string; dueAt: string | null; timezone: string | null };
    expect(action.dueAt).toBe('2026-09-25T16:00:00.000Z');
    expect(action.timezone).toBe('Asia/Shanghai');

    // 发生记录列表（初始为空）
    const empty = await fetch(`${base}/ops/actions/${action.id}/occurrences`, { headers: authHeaders });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual([]);

    // 创建复盘
    const reviewRes = await fetch(`${base}/ops/reviews`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        actionId: action.id,
        didWhat: 'o01-http 改了一版摘要',
        windowStart: '2026-09-01',
        windowEnd: '2026-09-10',
        evidenceState: 'INSUFFICIENT',
        requestKey: 'o01-http-req-1',
      }),
    });
    expect(reviewRes.status).toBe(201);
    const review = await reviewRes.json() as { id: string; evidenceState: string };
    expect(review.evidenceState).toBe('INSUFFICIENT');

    // 重复 requestKey：返回同一记录（列表仍为 1 条）
    const replay = await fetch(`${base}/ops/reviews`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ actionId: action.id, didWhat: 'o01-http 改了一版摘要', requestKey: 'o01-http-req-1' }),
    });
    expect(replay.status).toBe(201);
    expect((await replay.json() as { id: string }).id).toBe(review.id);

    const list = await fetch(`${base}/ops/reviews?actionId=${action.id}`, { headers: authHeaders });
    expect(list.status).toBe(200);
    expect(await list.json()).toHaveLength(1);

    // 详情可读
    const detail = await fetch(`${base}/ops/reviews/${review.id}`, { headers: authHeaders });
    expect(detail.status).toBe(200);
    expect((await detail.json() as { didWhat: string }).didWhat).toContain('摘要');

    // 清理本次 HTTP 造的事项
    await fetch(`${base}/actions/${action.id}`, { method: 'DELETE', headers: authHeaders });
  });

  it('非法时区经 HTTP 返回 400 且不落库', async () => {
    const res = await fetch(`${base}/ops/reminders/resolve-due`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ plannedDate: '2026-09-26', timezone: 'Not/AZone' }),
    });
    expect(res.status).toBe(400);
  });
});
