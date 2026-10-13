import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SITE_TIMEZONE } from '@walker/shared';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { ReminderService } from './reminder.service';
import { ActionService } from '../action/action.service';
import { ACTION_REPOSITORY, type ActionRepositoryPort } from '../ports/action.repository';
import { REMINDER_OCCURRENCE_REPOSITORY, type ReminderOccurrenceRepositoryPort } from '../ports/reminder.repository';
import { REVIEW_ENTRY_REPOSITORY, type ReviewEntryRepositoryPort } from '../ports/review-entry.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

const token = 'o01-reminder-token';
let app: TestingModule;
let reminders: ReminderService;
let actions: ActionService;
let actionRepo: ActionRepositoryPort;
let occurrences: ReminderOccurrenceRepositoryPort;
let reviews: ReviewEntryRepositoryPort;
let contentDir: string;

const TAG = 'o01-';

describe('O01 提醒发生记录与复盘数据', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-o01-content-'));
    process.env.WALKER_ADMIN_TOKEN = token;
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.AI_ENABLED = 'false';

    app = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] }).compile();
    await app.init();

    reminders = app.get(ReminderService);
    actions = app.get(ActionService);
    actionRepo = app.get(ACTION_REPOSITORY);
    occurrences = app.get(REMINDER_OCCURRENCE_REPOSITORY);
    reviews = app.get(REVIEW_ENTRY_REPOSITORY);
  });

  afterAll(async () => {
    const db = app?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.reminderOccurrence.deleteMany({ where: { actionId: { startsWith: TAG } } });
      await db.reviewEntry.deleteMany({ where: { actionId: { startsWith: TAG } } });
      await db.action.deleteMany({ where: { id: { startsWith: TAG } } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    delete process.env.WALKER_ADMIN_TOKEN;
    delete process.env.CONTENT_LOG_DIR;
  });

  it('日期型事项按站点时区当日 00:00 到期，UTC 与生成时区一并落库并可还原', async () => {
    const action = await actions.create({
      title: 'O01 单次日提醒',
      plannedDate: '2026-09-26',
    });
    expect(action.plannedDate).toBe('2026-09-26');
    expect(action.timezone).toBe(DEFAULT_SITE_TIMEZONE);
    // 2026-09-26 00:00 Asia/Shanghai == 2026-09-25T16:00Z
    expect(action.dueAt?.toISOString()).toBe('2026-09-25T16:00:00.000Z');

    const due = await reminders.resolveDue({ plannedDate: '2026-09-26' });
    expect(due.dueAt).toBe('2026-09-25T16:00:00.000Z');
  });

  it('重复扫描同一到期只产生一条发生记录（唯一键去重，不靠应用层判断）', async () => {
    const action = await actions.create({ title: 'O01 重复扫描', plannedDate: '2026-09-20' });
    const record = await actionRepo.findById(action.id);
    expect(record?.dueAt).toBeTruthy();

    const first = await reminders.recordDueOccurrence(record!, new Date('2026-09-20T00:00:00Z'));
    const second = await reminders.recordDueOccurrence(record!, new Date('2026-09-20T00:05:00Z'));
    const third = await reminders.recordDueOccurrence(record!, new Date('2026-09-20T00:10:00Z'));

    expect(first.created).toBe(true);
    // 第二、三次扫描命中同一去重键：不新增记录
    expect(second.created).toBe(false);
    expect(third.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);
    expect(third.record.id).toBe(first.record.id);

    const all = await occurrences.listForAction(action.id);
    expect(all).toHaveLength(1);
    expect(all[0]!.outcome).toBe('PENDING');
  });

  it('改期后到期瞬时原子更新：旧到期不会被再次触发（连续延后不触发旧提醒）', async () => {
    const action = await actions.create({ title: 'O01 连续延后', plannedDate: '2026-09-20' });
    const before = await actionRepo.findById(action.id);
    const firstOccurrence = await reminders.recordDueOccurrence(before!);
    expect(firstOccurrence.created).toBe(true);

    // 第一次延后
    await actions.update(action.id, { plannedDate: '2026-09-22' });
    // 第二次延后
    const afterFirst = await actionRepo.findById(action.id);
    expect(afterFirst?.dueAt?.toISOString()).toBe('2026-09-21T16:00:00.000Z');
    await actions.update(action.id, { plannedDate: '2026-09-25' });

    const after = await actionRepo.findById(action.id);
    expect(after?.dueAt?.toISOString()).toBe('2026-09-24T16:00:00.000Z');
    // 新到期的去重键与原到期不同 → 会正常产生一条新的发生记录
    const secondOccurrence = await reminders.recordDueOccurrence(after!);
    expect(secondOccurrence.created).toBe(true);
    expect(secondOccurrence.record.id).not.toBe(firstOccurrence.record.id);
    // 历史发生记录保留（不因改期被删）
    expect(await occurrences.listForAction(action.id)).toHaveLength(2);

    // 关键：再次扫描**旧**到期不得产生第三条（旧规则已随改期失效）
    const staleScan = await reminders.recordDueOccurrence(before!, new Date('2026-09-30T00:00:00Z'));
    expect(staleScan.created).toBe(false);
    expect(staleScan.record.id).toBe(firstOccurrence.record.id);
    expect(await occurrences.listForAction(action.id)).toHaveLength(2);
  });

  it('清空排期后不再有到期瞬时，且拒绝为无到期事项记录发生', async () => {
    const action = await actions.create({ title: 'O01 清空排期', plannedDate: '2026-09-20' });
    await actions.update(action.id, { plannedDate: null });
    const cleared = await actionRepo.findById(action.id);
    expect(cleared?.plannedDate).toBeNull();
    expect(cleared?.dueAt).toBeNull();
    await expect(reminders.recordDueOccurrence(cleared!)).rejects.toThrow(/action-has-no-due-at/);
  });

  it('非法时区与日期被拒绝，不静默回退到默认时区', async () => {
    await expect(reminders.resolveDue({ plannedDate: '2026-09-26', timezone: 'Not/AZone' }))
      .rejects.toThrow(/invalid-timezone/);
    await expect(actions.create({ title: 'O01 坏日期', plannedDate: '2026-9-6' }))
      .rejects.toThrow(/invalid-planned-date/);
  });

  it('复盘：关联事项与发布版本，记录行为/观察窗口/下一次尝试；requestKey 幂等', async () => {
    const action = await actions.create({ title: 'O01 复盘目标', plannedDate: '2026-09-20' });
    const requestKey = `o01-review-${randomUUID().slice(0, 8)}`;

    const first = await reminders.createReview({
      actionId: action.id,
      releaseId: 'rel-o01-demo',
      didWhat: '把文章摘要从一句话改成三句话',
      observed: '访客在摘要处的停留变长（样本少）',
      windowStart: '2026-09-01',
      windowEnd: '2026-09-15',
      nextAttempt: '下次同时改标题再观察一周',
      evidenceState: 'INSUFFICIENT',
      evidenceNote: '窗口内仅 3 次有效提问，不足以判断',
      requestKey,
    });
    expect(first.didWhat).toContain('摘要');
    expect(first.windowStart).toBe('2026-09-01');
    expect(first.windowEnd).toBe('2026-09-15');
    expect(first.evidenceState).toBe('INSUFFICIENT');
    expect(first.releaseId).toBe('rel-o01-demo');

    // 重复提交同 requestKey：返回同一记录，不产生第二条
    const replay = await reminders.createReview({
      actionId: action.id,
      didWhat: '把文章摘要从一句话改成三句话',
      requestKey,
    });
    expect(replay.id).toBe(first.id);
    const listed = await reminders.listReviews({ actionId: action.id });
    expect(listed).toHaveLength(1);
  });

  it('复盘默认证据状态为 UNKNOWN（样本不足如实写未知），并校验窗口有序', async () => {
    const action = await actions.create({ title: 'O01 复盘校验' });
    const saved = await reminders.createReview({
      actionId: action.id,
      didWhat: '只做了一次小改',
      requestKey: `o01-review-${randomUUID().slice(0, 8)}`,
    });
    expect(saved.evidenceState).toBe('UNKNOWN');

    await expect(reminders.createReview({
      actionId: action.id,
      didWhat: '窗口颠倒',
      windowStart: '2026-09-30',
      windowEnd: '2026-09-01',
      requestKey: `o01-review-${randomUUID().slice(0, 8)}`,
    })).rejects.toThrow(/invalid-review-window/);

    await expect(reminders.createReview({
      actionId: action.id,
      didWhat: '',
      requestKey: `o01-review-${randomUUID().slice(0, 8)}`,
    })).rejects.toThrow(/review-did-what-required/);

    await expect(reminders.createReview({
      actionId: 'o01-missing-action',
      didWhat: '挂到不存在的事项',
      requestKey: `o01-review-${randomUUID().slice(0, 8)}`,
    })).rejects.toThrow();
  });

  it('旧 Action 行为保留：完成/重开与既有字段不受影响', async () => {
    const action = await actions.create({ title: 'O01 旧行为回归', kind: 'VIDEO' });
    // 未排期：无到期瞬时，也不留伪时区
    expect(action.dueAt).toBeNull();
    expect(action.timezone).toBeNull();
    await expect(actions.complete(action.id)).resolves.toMatchObject({ status: 'DONE' });
    await expect(actions.reopen(action.id)).resolves.toMatchObject({ status: 'OPEN', completedAt: null });
    const listed = await actions.list({});
    expect(listed.find((item) => item.id === action.id)).toMatchObject({ kind: 'VIDEO', plannedDate: null });
  });
});
