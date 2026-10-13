import 'reflect-metadata';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { ReminderService } from './reminder.service';
import { ReminderScanService } from './reminder-scan.service';
import { ActionService } from '../action/action.service';
import { ACTION_REPOSITORY, type ActionRepositoryPort } from '../ports/action.repository';
import { REMINDER_OCCURRENCE_REPOSITORY, type ReminderOccurrenceRepositoryPort } from '../ports/reminder.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

const TAG = 'o03-';
let app: TestingModule;
let reminders: ReminderService;
let scan: ReminderScanService;
let actions: ActionService;
let actionRepo: ActionRepositoryPort;
let occurrences: ReminderOccurrenceRepositoryPort;
let contentDir: string;

async function makeDue(text: string, plannedDate = '2026-09-20') {
  const action = await actions.create({ title: `${TAG}${text}`, plannedDate });
  await scan.scanOnce(new Date('2026-09-25T00:00:00Z'));
  return action;
}

describe('O03 提醒完成、延后与忽略', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-o03-content-'));
    process.env.WALKER_ADMIN_TOKEN = 'o03-token';
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.AI_ENABLED = 'false';
    delete process.env.WALKER_RESTORE_GATE_FILE;

    app = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] }).compile();
    await app.init();
    reminders = app.get(ReminderService);
    scan = app.get(ReminderScanService);
    actions = app.get(ActionService);
    actionRepo = app.get(ACTION_REPOSITORY);
    occurrences = app.get(REMINDER_OCCURRENCE_REPOSITORY);
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

  it('完成：事项转 DONE、到期清空、发生记录置 DONE，并留下审计', async () => {
    const action = await makeDue('完成处置');
    const result = await reminders.dispose({
      actionId: action.id,
      disposition: 'complete',
      requestKey: 'o03-complete-1',
      actor: 'owner',
    });

    expect(result.disposition).toBe('complete');
    expect(result.occurrenceOutcome).toBe('DONE');
    expect(result.replayed).toBe(false);

    const after = await actionRepo.findById(action.id);
    expect(after?.status).toBe('DONE');
    expect(after?.completedAt).toBeInstanceOf(Date);
    // 到期清空：完成的提醒不再被扫描领取
    expect(after?.dueAt).toBeNull();

    const occ = await occurrences.listForAction(action.id);
    expect(occ).toHaveLength(1);
    expect(occ[0]!.outcome).toBe('DONE');
    expect(occ[0]!.resolvedAt).toBeInstanceOf(Date);

    const trail = await reminders.listDispositions(action.id);
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({ action: 'reminder.disposition', outcome: 'complete', actor: 'owner' });
  });

  it('重复完成无额外副作用：同 requestKey 重放返回首次结果，审计与发生记录都不再新增', async () => {
    const action = await makeDue('重复完成');
    const first = await reminders.dispose({
      actionId: action.id, disposition: 'complete', requestKey: 'o03-complete-replay',
    });
    const second = await reminders.dispose({
      actionId: action.id, disposition: 'complete', requestKey: 'o03-complete-replay',
    });

    expect(second.replayed).toBe(true);
    expect(second.occurrenceId).toBe(first.occurrenceId);
    // 审计只留一条：幂等重放不写第二行
    expect(await reminders.listDispositions(action.id)).toHaveLength(1);
    expect(await occurrences.listForAction(action.id)).toHaveLength(1);
  });

  it('延后：plannedDate/dueAt 原子更新，旧到期不再被扫描领取（连续延后不触发旧提醒）', async () => {
    const action = await makeDue('延后处置');
    const before = await actionRepo.findById(action.id);
    expect(before?.dueAt?.toISOString()).toBe('2026-09-19T16:00:00.000Z');

    // 第一次延后
    const first = await reminders.dispose({
      actionId: action.id, disposition: 'snooze', plannedDate: '2026-10-10',
      requestKey: 'o03-snooze-1',
    });
    expect(first.dueAt?.toISOString()).toBe('2026-10-09T16:00:00.000Z');
    let after = await actionRepo.findById(action.id);
    expect(after?.plannedDate).toBe('2026-10-10');
    expect(after?.dueAt?.toISOString()).toBe('2026-10-09T16:00:00.000Z');

    // 第二次延后（再次改期）
    const second = await reminders.dispose({
      actionId: action.id, disposition: 'snooze', plannedDate: '2026-11-05',
      requestKey: 'o03-snooze-2',
    });
    expect(second.dueAt?.toISOString()).toBe('2026-11-04T16:00:00.000Z');
    after = await actionRepo.findById(action.id);
    expect(after?.dueAt?.toISOString()).toBe('2026-11-04T16:00:00.000Z');

    // 关键：在旧到期之后、新到期之前扫描 —— 旧到期不得再触发
    await scan.scanOnce(new Date('2026-09-25T00:00:00Z'));
    await scan.scanOnce(new Date('2026-10-15T00:00:00Z'));
    // 只有首次到期那一条历史记录；两次延后都不产生新记录
    expect(await occurrences.listForAction(action.id)).toHaveLength(1);

    // 新到期到来后才产生第二条
    await scan.scanOnce(new Date('2026-11-05T00:00:00Z'));
    expect(await occurrences.listForAction(action.id)).toHaveLength(2);
  });

  it('忽略：发生记录置 IGNORED 可带原因，事项仍 OPEN 但不再被扫描领取', async () => {
    const action = await makeDue('忽略处置');
    const result = await reminders.dispose({
      actionId: action.id, disposition: 'ignore', reason: '这周不打算动它',
      requestKey: 'o03-ignore-1',
    });
    expect(result.occurrenceOutcome).toBe('IGNORED');

    const occ = await occurrences.listForAction(action.id);
    expect(occ[0]!.outcome).toBe('IGNORED');
    expect(occ[0]!.reason).toBe('这周不打算动它');

    const after = await actionRepo.findById(action.id);
    // 忽略 ≠ 完成：事项仍开放，只是这次到期被撤下
    expect(after?.status).toBe('OPEN');
    expect(after?.dueAt).toBeNull();

    // 已被撤下的到期不会再被扫描领取
    const before = await occurrences.listForAction(action.id);
    await scan.scanOnce(new Date('2026-09-30T00:00:00Z'));
    expect(await occurrences.listForAction(action.id)).toHaveLength(before.length);
  });

  it('未实现的重复规则明确拒绝（501），不静默降级成单次', async () => {
    const action = await makeDue('重复规则');
    await expect(reminders.dispose({
      actionId: action.id, disposition: 'snooze', plannedDate: '2026-10-10',
      repeat: 'weekly', requestKey: 'o03-repeat-weekly',
    })).rejects.toThrow(/重复提醒规则尚未实现/);

    // repeat: none 是允许的（等价于不传）
    await expect(reminders.dispose({
      actionId: action.id, disposition: 'snooze', plannedDate: '2026-10-10',
      repeat: 'none', requestKey: 'o03-repeat-none',
    })).resolves.toMatchObject({ disposition: 'snooze' });
  });

  it('创建/更新事项时带未实现重复规则同样明确拒绝（不在入口静默丢弃字段）', async () => {
    await expect(actions.create({ title: `${TAG}带repeat创建`, plannedDate: '2026-10-01', repeat: 'weekly' }))
      .rejects.toThrow(/重复提醒规则尚未实现/);
    await expect(actions.create({ title: `${TAG}repeat-none创建`, plannedDate: '2026-10-01', repeat: 'none' }))
      .resolves.toMatchObject({ plannedDate: '2026-10-01' });

    const action = await actions.create({ title: `${TAG}带repeat更新`, plannedDate: '2026-10-01' });
    await expect(actions.update(action.id, { repeat: 'daily' }))
      .rejects.toThrow(/重复提醒规则尚未实现/);
  });

  it('参数校验：缺少 actionId/requestKey、非法处置、延后缺日期均被拒绝', async () => {
    const action = await makeDue('参数校验');
    await expect(reminders.dispose({ disposition: 'complete', requestKey: 'o03-v1' }))
      .rejects.toThrow(/reminder-action-required/);
    await expect(reminders.dispose({ actionId: action.id, disposition: 'complete' }))
      .rejects.toThrow(/reminder-request-key-required/);
    await expect(reminders.dispose({ actionId: action.id, disposition: 'nonsense', requestKey: 'o03-v2' }))
      .rejects.toThrow(/invalid-reminder-disposition/);
    await expect(reminders.dispose({ actionId: action.id, disposition: 'snooze', requestKey: 'o03-v3' }))
      .rejects.toThrow(/reminder-snooze-date-required/);
    await expect(reminders.dispose({
      actionId: action.id, disposition: 'snooze', plannedDate: '2026-13-40', requestKey: 'o03-v4',
    })).rejects.toThrow(/invalid-planned-date/);
    await expect(reminders.dispose({
      actionId: 'o03-missing', disposition: 'complete', requestKey: 'o03-v5',
    })).rejects.toThrow();
  });

  it('事务原子性：事务内失败时整体回滚，不留「提醒已处理、事项仍指旧到期」的半截状态', async () => {
    const action = await makeDue('事务原子性');
    const before = await actionRepo.findById(action.id);
    const occBefore = await occurrences.listForAction(action.id);
    expect(before?.dueAt?.toISOString()).toBe('2026-09-19T16:00:00.000Z');
    expect(occBefore[0]!.outcome).toBe('PENDING');

    // 注入失败：在事务内、写审计之前抛错（直接读库核对回滚，不经缓存层）
    const db = app.get<PrismaPort>(PRISMA).getClient()!;
    const dispositionRepo = app.get<{ dispose: (input: unknown) => Promise<unknown> }>(
      (await import('../ports/reminder-disposition.port')).REMINDER_DISPOSITION,
    );
    const realDispose = dispositionRepo.dispose.bind(dispositionRepo);
    // 让 Action 更新在事务内发生，然后由审计前的失败触发回滚：
    // 复用真实实现，仅在审计写入前抛错 —— 通过临时移除 auditRecord 的原子性来验证
    const realTransaction = db.$transaction;
    (db as { $transaction: unknown }).$transaction = function patched(this: unknown, fn: unknown) {
      // 在事务体内注入一次失败：包一层，先跑真实事务体再抛错（Prisma 会回滚）
      return realTransaction.call(db, async (tx: unknown) => {
        const out = await (fn as (t: unknown) => Promise<unknown>)(tx);
        throw new Error('injected-in-transaction-failure');
        return out;
      });
    };

    let failed = false;
    try {
      await realDispose({
        actionId: action.id, disposition: 'complete',
        actor: 'owner', requestKey: 'o03-atomic-fail', now: new Date(),
      });
    } catch {
      failed = true;
    } finally {
      (db as { $transaction: unknown }).$transaction = realTransaction;
    }

    expect(failed).toBe(true);

    // 三个事实必须一起回滚：事项状态、到期瞬时、发生记录结果、审计
    const after = await actionRepo.findById(action.id);
    expect(after?.status).toBe('OPEN');
    expect(after?.dueAt?.toISOString()).toBe('2026-09-19T16:00:00.000Z');
    const occAfter = await occurrences.listForAction(action.id);
    expect(occAfter[0]!.outcome).toBe('PENDING');
    expect(await reminders.listDispositions(action.id)).toHaveLength(0);

    // 恢复后同一请求键可以正常完成（失败的请求键未被消费）
    const retry = await reminders.dispose({
      actionId: action.id, disposition: 'complete', requestKey: 'o03-atomic-fail',
    });
    expect(retry.replayed).toBe(false);
    expect((await actionRepo.findById(action.id))?.status).toBe('DONE');
  });

  it('处置不调用模型、不发外部通知（零 fetch，ExecutionRun 不增）', async () => {
    const action = await makeDue('无副作用');
    const db = app.get<PrismaPort>(PRISMA).getClient()!;
    const runsBefore = await db.executionRun.count();

    const realFetch = globalThis.fetch;
    const fetchCalls: string[] = [];
    globalThis.fetch = ((input: unknown, init?: unknown) => {
      fetchCalls.push(String(input));
      return realFetch(input as RequestInfo, init as RequestInit);
    }) as typeof fetch;
    try {
      await reminders.dispose({
        actionId: action.id, disposition: 'snooze', plannedDate: '2026-10-20', requestKey: 'o03-nofx',
      });
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(fetchCalls).toEqual([]);
    expect(await db.executionRun.count()).toBe(runsBefore);
  });
});
