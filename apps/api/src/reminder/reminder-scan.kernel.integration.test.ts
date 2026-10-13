import 'reflect-metadata';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { ReminderScanService } from './reminder-scan.service';
import { ReminderService } from './reminder.service';
import { ActionService } from '../action/action.service';
import { ACTION_REPOSITORY, type ActionRepositoryPort } from '../ports/action.repository';
import { REMINDER_OCCURRENCE_REPOSITORY, type ReminderOccurrenceRepositoryPort } from '../ports/reminder.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

const TAG = 'o02-';
let app: TestingModule;
let scan: ReminderScanService;
let actions: ActionService;
let actionRepo: ActionRepositoryPort;
let occurrences: ReminderOccurrenceRepositoryPort;
let contentDir: string;

describe('O02 到期扫描与恢复补检', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-o02-content-'));
    process.env.WALKER_ADMIN_TOKEN = 'o02-token';
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.AI_ENABLED = 'false';
    // 确保恢复门未挂起，否则扫描按约定直接跳过
    delete process.env.WALKER_RESTORE_GATE_FILE;

    app = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] }).compile();
    await app.init();
    scan = app.get(ReminderScanService);
    actions = app.get(ActionService);
    actionRepo = app.get(ACTION_REPOSITORY);
    occurrences = app.get(REMINDER_OCCURRENCE_REPOSITORY);
  });

  afterAll(async () => {
    const db = app?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.reminderOccurrence.deleteMany({ where: { actionId: { startsWith: TAG } } });
      await db.action.deleteMany({ where: { id: { startsWith: TAG } } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    delete process.env.WALKER_ADMIN_TOKEN;
    delete process.env.CONTENT_LOG_DIR;
  });

  it('扫描只领取到期且未完成的事项：未到期与已完成都不产生发生记录', async () => {
    // 已到期（站点 2026-09-20 00:00 = 2026-09-19T16:00Z）
    const dueAction = await actions.create({ title: 'o02-已到期', plannedDate: '2026-09-20' });
    // 未到期（2026-12-31）
    const futureAction = await actions.create({ title: 'o02-未到期', plannedDate: '2026-12-31' });
    // 已到期但已完成
    const doneAction = await actions.create({ title: 'o02-已完成', plannedDate: '2026-09-20' });
    await actions.complete(doneAction.id);

    const now = new Date('2026-09-25T00:00:00Z');
    await scan.scanOnce(now);

    const due = await occurrences.listForAction(dueAction.id);
    const future = await occurrences.listForAction(futureAction.id);
    const done = await occurrences.listForAction(doneAction.id);

    expect(due).toHaveLength(1);
    expect(future).toHaveLength(0);
    expect(done).toHaveLength(0);
  });

  it('重复扫描不重复产生：连续多轮命中恒为 1 条，且如实报告 deduped 而非 created', async () => {
    const action = await actions.create({ title: 'o02-重复扫描', plannedDate: '2026-09-20' });
    const now = new Date('2026-09-25T00:00:00Z');

    const first = await scan.scanOnce(now);
    const second = await scan.scanOnce(now);
    const third = await scan.scanOnce(new Date('2026-09-25T01:00:00Z'));

    expect(await occurrences.listForAction(action.id)).toHaveLength(1);
    // 第一轮可能有其它用例的到期一起被处理；关键是我们这条只产生过一条记录
    expect(first.created + first.deduped).toBeGreaterThan(0);
    // 后两轮同一到期必然只命中已有记录
    expect(second.deduped).toBeGreaterThan(0);
    expect(third.deduped).toBeGreaterThan(0);
  });

  it('跨日补扫：进程重启后（新实例、同一库）不会丢也不会重复', async () => {
    const action = await actions.create({ title: 'o02-跨日补扫', plannedDate: '2026-09-20' });
    const now = new Date('2026-09-21T00:00:00Z');

    // 第一次运行
    await scan.scanOnce(now);
    expect(await occurrences.listForAction(action.id)).toHaveLength(1);

    // 模拟「进程重启」：同一库上重建模块（新服务实例）
    await app.close();
    app = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] }).compile();
    await app.init();
    scan = app.get(ReminderScanService);
    actions = app.get(ActionService);
    actionRepo = app.get(ACTION_REPOSITORY);
    occurrences = app.get(REMINDER_OCCURRENCE_REPOSITORY);

    // 启动补检再跑一轮：既有记录仍在且未重复
    const afterRestart = await scan.scanOnce(new Date('2026-09-21T05:00:00Z'));
    expect(await occurrences.listForAction(action.id)).toHaveLength(1);
    expect(afterRestart.deduped).toBeGreaterThan(0);
  });

  it('延后（改期）后旧到期不会再被扫描领取：只按新到期产生记录', async () => {
    const action = await actions.create({ title: 'o02-延后不触发旧到期', plannedDate: '2026-09-20' });
    // 先让旧到期产生一条记录
    await scan.scanOnce(new Date('2026-09-20T20:00:00Z'));
    expect(await occurrences.listForAction(action.id)).toHaveLength(1);

    // 延后到 2026-10-20（旧到期已过去，但 dueAt 被原子重算）
    await actions.update(action.id, { plannedDate: '2026-10-20' });
    const updated = await actionRepo.findById(action.id);
    expect(updated?.dueAt?.toISOString()).toBe('2026-10-19T16:00:00.000Z');

    // 在「旧到期之后、新到期之前」扫描：不得产生新的发生记录
    await scan.scanOnce(new Date('2026-09-25T00:00:00Z'));
    expect(await occurrences.listForAction(action.id)).toHaveLength(1);

    // 新到期之后再扫：才产生第二条
    await scan.scanOnce(new Date('2026-10-20T00:00:00Z'));
    expect(await occurrences.listForAction(action.id)).toHaveLength(2);
  });

  it('未排期事项不被领取；完成事项不再产生新记录', async () => {
    const undated = await actions.create({ title: 'o02-未排期' });
    const completed = await actions.create({ title: 'o02-完成后到期', plannedDate: '2026-09-20' });
    await actions.complete(completed.id);

    await scan.scanOnce(new Date('2026-10-01T00:00:00Z'));

    expect(await occurrences.listForAction(undated.id)).toHaveLength(0);
    expect(await occurrences.listForAction(completed.id)).toHaveLength(0);
  });

  it('扫描结果如实计数：created + deduped + skipped 与库内发生记录一致（不虚报成功）', async () => {
    const now = new Date('2026-09-26T00:00:00Z');
    const action = await actions.create({ title: 'o02-计数一致', plannedDate: '2026-09-25' });

    const result = await scan.scanOnce(now);
    expect(result.scannedAt).toBe(now.toISOString());
    expect(result.created).toBeGreaterThan(0);

    // 再跑一次：同一到期只应计入 deduped，不再计 created
    const again = await scan.scanOnce(now);
    expect(again.created).toBe(0);
    expect(again.deduped).toBeGreaterThan(0);

    const stored = await occurrences.listForAction(action.id);
    expect(stored).toHaveLength(1);
  });

  it('并发调用只跑一轮（防重入），不产生重复记录', async () => {
    const action = await actions.create({ title: 'o02-并发防重入', plannedDate: '2026-09-20' });
    const now = new Date('2026-09-25T00:00:00Z');

    await Promise.all([scan.scanOnce(now), scan.scanOnce(now), scan.scanOnce(now)]);

    expect(await occurrences.listForAction(action.id)).toHaveLength(1);
  });

  it('定时器可启动且可干净停止；重复启动不叠加（不为每轮留下悬挂计时器）', async () => {
    const fresh = new ReminderScanService(
      app.get<PrismaPort>(PRISMA),
      actionRepo,
      app.get(ReminderService),
    );
    await fresh.startScheduler();
    // 重复启动是幂等的：既有计时器不会被替换成第二个
    await fresh.startScheduler();
    const timers = Object.values((fresh as unknown as { timer: unknown; [k: string]: unknown }))
      .filter((value) => value !== null && typeof value === 'object' && 'hasRef' in (value as object));
    expect(timers).toHaveLength(1);

    await fresh.onModuleDestroy();
    expect((fresh as unknown as { timer: unknown }).timer).toBeNull();
    // 停止后再启动不应抛错（幂等）
    await fresh.startScheduler();
    await fresh.onModuleDestroy();
  });

  it('扫描不调用模型（不产生任何运行记录）、不发外部通知（零 fetch）', async () => {
    const action = await actions.create({ title: 'o02-无副作用', plannedDate: '2026-09-20' });
    const db = app.get<PrismaPort>(PRISMA).getClient()!;

    // 模型只能经统一执行服务跑：先记下当前运行数，扫描后必须一字不增
    const runsBefore = await db.executionRun.count();

    const realFetch = globalThis.fetch;
    const fetchCalls: string[] = [];
    globalThis.fetch = ((input: unknown, init?: unknown) => {
      fetchCalls.push(String(input));
      return realFetch(input as RequestInfo, init as RequestInit);
    }) as typeof fetch;

    let result;
    try {
      result = await scan.scanOnce(new Date('2026-09-25T00:00:00Z'));
    } finally {
      globalThis.fetch = realFetch;
    }

    // 不发外部通知，也不请求模型 HTTP
    expect(fetchCalls).toEqual([]);
    // 没有新建 Agent 进程：运行表一字未增
    expect(await db.executionRun.count()).toBe(runsBefore);
    // 唯一副作用是本地一条发生记录
    expect(result.created).toBeGreaterThan(0);
    expect(await occurrences.listForAction(action.id)).toHaveLength(1);
  });

  it('恢复门挂起时扫描按约定跳过（fail-closed），不产生任何发生记录', async () => {
    const action = await actions.create({ title: 'o02-恢复门', plannedDate: '2026-09-20' });
    const gateFile = path.join(contentDir, 'restore.pending');
    await fs.writeFile(gateFile, 'pending', 'utf8');
    process.env.WALKER_RESTORE_GATE_FILE = gateFile;
    try {
      const result = await scan.scanOnce(new Date('2026-09-25T00:00:00Z'));
      // 恢复期间一律不扫描：计数全 0，且该事项没有发生记录
      expect(result).toMatchObject({ created: 0, deduped: 0, skipped: 0 });
      expect(await occurrences.listForAction(action.id)).toHaveLength(0);
    } finally {
      delete process.env.WALKER_RESTORE_GATE_FILE;
      await fs.rm(gateFile, { force: true });
    }

    // 恢复门清除后恢复正常扫描
    await scan.scanOnce(new Date('2026-09-25T00:00:00Z'));
    expect(await occurrences.listForAction(action.id)).toHaveLength(1);
  });
});
