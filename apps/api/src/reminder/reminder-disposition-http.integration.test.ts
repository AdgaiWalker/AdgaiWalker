import 'reflect-metadata';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

const token = 'o03-http-token';
const authHeaders = { 'x-admin-token': token, 'content-type': 'application/json' };
const TAG = 'o03-http-';

let app: INestApplication;
let base: string;
let contentDir: string;
let moduleRef: TestingModule;

describe('O03 提醒处置的 HTTP 出口（管理鉴权）', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-o03-http-'));
    process.env.WALKER_ADMIN_TOKEN = token;
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.AI_ENABLED = 'false';
    delete process.env.WALKER_RESTORE_GATE_FILE;

    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    const db = app?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.auditRecord.deleteMany({ where: { targetId: { startsWith: TAG } } });
      await db.reminderOccurrence.deleteMany({ where: { actionId: { startsWith: TAG } } });
      await db.action.deleteMany({ where: { id: { startsWith: TAG } } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    delete process.env.WALKER_ADMIN_TOKEN;
    delete process.env.CONTENT_LOG_DIR;
  });

  async function createAction(title: string, plannedDate: string) {
    const res = await fetch(`${base}/actions`, {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ title: `${TAG}${title}`, plannedDate }),
    });
    expect(res.status).toBe(201);
    return await res.json() as { id: string; dueAt: string | null };
  }

  it('AI 关闭时提醒系统仍完整工作（提醒不依赖模型）', async () => {
    // 该套件 beforeAll 已设 AI_ENABLED=false：此处的断言即「关掉 AI 也能用」的直接证据
    expect(process.env.AI_ENABLED).toBe('false');

    // 1. 创建带排期的事项 → 立即得到到期瞬时
    const action = await createAction('ai关闭', '2026-09-20');
    expect(action.dueAt).toBe('2026-09-19T16:00:00.000Z');

    // 2. 提醒箱可读（服务端算好到期分类）
    const inboxRes = await fetch(`${base}/ops/reminders/inbox`, { headers: authHeaders });
    expect(inboxRes.status).toBe(200);
    const inbox = await inboxRes.json() as {
      timezone: string;
      today: string;
      items: Array<{ actionId: string; dueState: string }>;
    };
    expect(inbox.timezone).toBe('Asia/Shanghai');
    expect(inbox.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const mine = inbox.items.find((item) => item.actionId === action.id);
    expect(mine).toBeDefined();
    // 2026-09-20 相对今天已过期
    expect(mine!.dueState).toBe('overdue');

    // 3. 处置可执行
    const dispose = await fetch(`${base}/ops/actions/${action.id}/disposition`, {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ disposition: 'complete', requestKey: 'o03-http-ai-off' }),
    });
    expect(dispose.status).toBe(201);

    await fetch(`${base}/actions/${action.id}`, { method: 'DELETE', headers: authHeaders });
  });

  it('匿名访问处置端点被 401 拦截', async () => {
    const res = await fetch(`${base}/ops/actions/${TAG}x/disposition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ disposition: 'complete', requestKey: 'o03-http-anon' }),
    });
    expect(res.status).toBe(401);
  });

  it('完成处置经 HTTP 走通：事项转 DONE，处置历史可回看', async () => {
    const action = await createAction('http完成', '2026-09-20');
    expect(action.dueAt).toBe('2026-09-19T16:00:00.000Z');

    const res = await fetch(`${base}/ops/actions/${action.id}/disposition`, {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ disposition: 'complete', requestKey: 'o03-http-complete' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { disposition: string; replayed: boolean };
    expect(body.disposition).toBe('complete');
    expect(body.replayed).toBe(false);

    // 重复提交同 requestKey：幂等重放
    const replay = await fetch(`${base}/ops/actions/${action.id}/disposition`, {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ disposition: 'complete', requestKey: 'o03-http-complete' }),
    });
    expect(replay.status).toBe(201);
    expect((await replay.json() as { replayed: boolean }).replayed).toBe(true);

    // 处置历史只留一条
    const trail = await fetch(`${base}/ops/actions/${action.id}/dispositions`, { headers: authHeaders });
    expect(trail.status).toBe(200);
    const entries = await trail.json() as Array<{ action: string }>;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe('reminder.disposition');

    await fetch(`${base}/actions/${action.id}`, { method: 'DELETE', headers: authHeaders });
  });

  it('延后与忽略经 HTTP 生效；未实现的重复规则返回 501', async () => {
    const snoozeAction = await createAction('http延后', '2026-09-20');
    const snooze = await fetch(`${base}/ops/actions/${snoozeAction.id}/disposition`, {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ disposition: 'snooze', plannedDate: '2026-10-10', requestKey: 'o03-http-snooze' }),
    });
    expect(snooze.status).toBe(201);
    expect((await snooze.json() as { dueAt: string }).dueAt).toBe('2026-10-09T16:00:00.000Z');

    const ignoreAction = await createAction('http忽略', '2026-09-20');
    const ignore = await fetch(`${base}/ops/actions/${ignoreAction.id}/disposition`, {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ disposition: 'ignore', reason: '暂不处理', requestKey: 'o03-http-ignore' }),
    });
    expect(ignore.status).toBe(201);

    const repeat = await fetch(`${base}/ops/actions/${ignoreAction.id}/disposition`, {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ disposition: 'snooze', plannedDate: '2026-11-01', repeat: 'weekly', requestKey: 'o03-http-repeat' }),
    });
    expect(repeat.status).toBe(501);

    await fetch(`${base}/actions/${snoozeAction.id}`, { method: 'DELETE', headers: authHeaders });
    await fetch(`${base}/actions/${ignoreAction.id}`, { method: 'DELETE', headers: authHeaders });
  });
});
