import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { ReminderService } from './reminder.service';
import { ActionService } from '../action/action.service';
import { ACTION_REPOSITORY, type ActionRepositoryPort } from '../ports/action.repository';
import { ReminderScanService } from './reminder-scan.service';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

const TAG = 'o09-';
let app: TestingModule;
let reminders: ReminderService;
let actions: ActionService;
let actionRepo: ActionRepositoryPort;
let scan: ReminderScanService;
let contentDir: string;
let db: NonNullable<ReturnType<PrismaPort['getClient']>>;

describe('O09 复盘建议显式转下一事项', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-o09-content-'));
    process.env.WALKER_ADMIN_TOKEN = 'o09-token';
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.AI_ENABLED = 'false';
    delete process.env.WALKER_RESTORE_GATE_FILE;

    app = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] }).compile();
    await app.init();
    reminders = app.get(ReminderService);
    actions = app.get(ActionService);
    actionRepo = app.get(ACTION_REPOSITORY);
    scan = app.get(ReminderScanService);
    db = app.get<PrismaPort>(PRISMA).getClient()!;
  });

  afterAll(async () => {
    if (db) {
      await db.reviewEntry.deleteMany({ where: { actionId: { startsWith: TAG } } });
      await db.auditRecord.deleteMany({ where: { targetId: { startsWith: TAG } } });
      await db.reminderOccurrence.deleteMany({ where: { actionId: { startsWith: TAG } } });
      await db.action.deleteMany({ where: { id: { startsWith: TAG } } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    delete process.env.WALKER_ADMIN_TOKEN;
    delete process.env.CONTENT_LOG_DIR;
  });

  async function makeReview(nextAttempt: string) {
    const action = await actions.create({ title: `${TAG}复盘来源事项` });
    return reminders.createReview({
      actionId: action.id,
      didWhat: `${TAG}改了导言与示例`,
      nextAttempt,
      requestKey: `o09-review-${randomUUID().slice(0, 8)}`,
    });
  }

  it('转为下一事项：保留复盘引用（entityType=REVIEW），标题来自下一次尝试', async () => {
    const review = await makeReview('增加交互式示例并对比转化');
    const result = await reminders.convertReviewToAction({
      reviewId: review.id,
      requestKey: `${TAG}req-convert-1`,
    });

    expect(result.replayed).toBe(false);
    const action = result.action;
    expect(action.entityType).toBe('REVIEW');
    expect(action.entityId).toBe(review.id);
    expect(action.title).toContain('增加交互式示例');
    expect(action.status).toBe('OPEN');
    // 备注里保留原复盘的事实（可回溯）
    expect(action.note).toContain(review.id);
    expect(action.note).toContain('改了导言与示例');
  });

  it('重复点击（同 requestKey）只产生一条事项，幂等回放', async () => {
    const review = await makeReview('补充分布式部署说明');
    const key = `${TAG}req-idem`;

    const first = await reminders.convertReviewToAction({ reviewId: review.id, requestKey: key });
    const second = await reminders.convertReviewToAction({ reviewId: review.id, requestKey: key });

    expect(second.replayed).toBe(true);
    expect(second.action.id).toBe(first.action.id);
    // 该复盘只对应一条生成事项
    const count = await db.action.count({
      where: { entityType: 'REVIEW', entityId: review.id },
    });
    expect(count).toBe(1);
  });

  it('新事项可设置提醒日期并推导到期瞬时（复用共享时间规则）', async () => {
    const review = await makeReview('再观察一周的搜索词变化');
    const result = await reminders.convertReviewToAction({
      reviewId: review.id,
      plannedDate: '2026-10-20',
      requestKey: `${TAG}req-due`,
    });

    const action = result.action;
    expect(action.plannedDate).toBe('2026-10-20');
    expect(action.timezone).toBe('Asia/Shanghai');
    expect(action.dueAt?.toISOString()).toBe('2026-10-19T16:00:00.000Z');

    // 到期被扫描领取后产生发生记录（提醒链路完整接通）
    await scan.scanOnce(new Date('2026-10-21T00:00:00Z'));
    const occurrences = await db.reminderOccurrence.findMany({
      where: { actionId: action.id },
    });
    expect(occurrences.length).toBe(1);
  });

  it('从事项可回溯原复盘：getReviewForAction 返回原记录', async () => {
    const review = await makeReview('在移动端验证排版');
    const { action } = await reminders.convertReviewToAction({
      reviewId: review.id,
      requestKey: `${TAG}req-trace`,
    });

    const traced = await reminders.getReviewForAction(action.id);
    expect(traced).not.toBeNull();
    expect(traced!.id).toBe(review.id);
    expect(traced!.nextAttempt).toBe('在移动端验证排版');

    // 非复盘来源的事项返回 null（不误报）
    const plain = await actions.create({ title: `${TAG}普通事项` });
    expect(await reminders.getReviewForAction(plain.id)).toBeNull();
  });

  it('没有下一次尝试的复盘不能转换（明确拒绝）', async () => {
    const action = await actions.create({ title: `${TAG}无建议复盘` });
    const review = await reminders.createReview({
      actionId: action.id,
      didWhat: `${TAG}只是记录了一下`,
      requestKey: `o09-review-none-${randomUUID().slice(0, 8)}`,
    });

    await expect(reminders.convertReviewToAction({
      reviewId: review.id,
      requestKey: `${TAG}req-none`,
    })).rejects.toThrow(/review-has-no-next-attempt/);
  });

  it('复盘不存在 / 缺 requestKey 被拒绝；不自动创建 Seed 或发布', async () => {
    const review = await makeReview('继续观察');
    await expect(reminders.convertReviewToAction({
      reviewId: 'no-such-review',
      requestKey: 'k1',
    })).rejects.toThrow();
    await expect(reminders.convertReviewToAction({
      reviewId: review.id,
      requestKey: '',
    })).rejects.toThrow(/review-action-request-key-required/);

    // 转换不产生 Seed、不产生内容候选（不自动选题/发布）
    const { action } = await reminders.convertReviewToAction({
      reviewId: review.id,
      requestKey: `${TAG}req-noauto`,
    });
    expect(action.source).toBe('HUMAN');
  });
});
