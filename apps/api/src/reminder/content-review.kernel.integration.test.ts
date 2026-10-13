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
import { CONTENT_RELEASE_REPOSITORY, type ContentReleaseRepositoryPort } from '../ports/content-release.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { newId } from '../common/ids';
import { contentApprovalHash } from '../adapters/content-approval.persistence';

const TAG = 'o08-';
let app: TestingModule;
let reminders: ReminderService;
let actions: ActionService;
let actionRepo: ActionRepositoryPort;
let releasesRepo: ContentReleaseRepositoryPort;
let contentDir: string;
let db: NonNullable<ReturnType<PrismaPort['getClient']>>;

describe('O08 内容更新复盘', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-o08-content-'));
    process.env.WALKER_ADMIN_TOKEN = 'o08-token';
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.AI_ENABLED = 'false';
    delete process.env.WALKER_RESTORE_GATE_FILE;

    app = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] }).compile();
    await app.init();
    reminders = app.get(ReminderService);
    actions = app.get(ActionService);
    actionRepo = app.get(ACTION_REPOSITORY);
    releasesRepo = app.get(CONTENT_RELEASE_REPOSITORY);
    db = app.get<PrismaPort>(PRISMA).getClient()!;
  });

  afterAll(async () => {
    if (db) {
      await db.reviewEntry.deleteMany({ where: { actionId: { startsWith: TAG } } });
      await db.action.deleteMany({ where: { id: { startsWith: TAG } } });
      await db.contentRelease.deleteMany({ where: { id: { startsWith: TAG } } });
      await db.contentChange.deleteMany({ where: { id: { startsWith: TAG } } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    delete process.env.WALKER_ADMIN_TOKEN;
    delete process.env.CONTENT_LOG_DIR;
  });

  it('保存并回看复盘：记录行为、观察、窗口、指标来源与下一次尝试', async () => {
    const action = await actions.create({ title: `${TAG}文章重构事项` });
    const requestKey = `${TAG}req-1`;

    const created = await reminders.createReview({
      actionId: action.id,
      didWhat: '重写导言并补充 3 个落地工具对照',
      observed: '读者在落地工具部分有点击反馈',
      windowStart: '2026-09-20',
      windowEnd: '2026-09-27',
      nextAttempt: '下周增加交互式示例',
      evidenceState: 'INSUFFICIENT',
      evidenceNote: '来源于 /ops/overview 7d 窗口，访客提问从 2 次上升到 5 次，样本不足尚不能确证因果',
      requestKey,
      actor: 'owner',
    });

    expect(created.id).toBeDefined();
    expect(created.actionId).toBe(action.id);
    expect(created.didWhat).toBe('重写导言并补充 3 个落地工具对照');
    expect(created.observed).toBe('读者在落地工具部分有点击反馈');
    expect(created.windowStart).toBe('2026-09-20');
    expect(created.windowEnd).toBe('2026-09-27');
    expect(created.nextAttempt).toBe('下周增加交互式示例');
    expect(created.evidenceState).toBe('INSUFFICIENT');
    expect(created.evidenceNote).toContain('样本不足尚不能确证因果');
    expect(created.createdBy).toBe('owner');

    // 回看单条
    const read = await reminders.getReview(created.id);
    expect(read).toEqual(created);

    // 回看列表
    const list = await reminders.listReviews({ actionId: action.id });
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(created.id);
  });

  it('样本不足明确写 UNKNOWN，不把模型建议当成已验证成效', async () => {
    const action = await actions.create({ title: `${TAG}小改动事项` });
    const requestKey = `${TAG}req-unknown`;

    const review = await reminders.createReview({
      actionId: action.id,
      didWhat: '修饰了两个小标题',
      requestKey,
    });

    // 默认证据充分度为 UNKNOWN
    expect(review.evidenceState).toBe('UNKNOWN');
    expect(review.observed).toBeNull();
    expect(review.windowStart).toBeNull();
  });

  it('关联已核验发布版本：若发布存在且未核验（如 FAILED/COMMITTING），拒绝关联', async () => {
    const action = await actions.create({ title: `${TAG}发布关联事项` });
    const releaseId = `${TAG}rel-unverified`;
    const changeId = `${TAG}chg-${randomUUID().slice(0, 8)}`;

    await db.contentChange.create({
      data: {
        id: changeId,
        targetSlug: 'post-test',
        baseHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        candidateHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        candidateRef: 'cand-ref',
        requestKey: `req-${changeId}`,
        state: 'APPLIED',
        appliedHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      },
    });

    const release = await releasesRepo.createOnce({
      id: releaseId,
      changeId,
      target: { kind: 'content', slug: 'post-test' },
      baseHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      sourceHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      requestKey: `req-${releaseId}`,
      publishApproval: (() => {
        const binding = {
          action: 'publish-website' as const,
          target: { kind: 'content' as const, slug: 'post-test' },
          baseHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          candidateHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
          grantId: 'grant-test',
          grantRevision: 1,
        };
        return {
          id: `appr-${releaseId}`,
          binding,
          bindingHash: contentApprovalHash(binding),
          approvedBy: 'owner',
          approvedAt: new Date().toISOString(),
        };
      })(),
    });
    // 初始状态为 PREPARED，属于未完成发布的记录

    await expect(reminders.createReview({
      actionId: action.id,
      releaseId,
      didWhat: '尝试关联未完成发布的记录',
      requestKey: `${TAG}req-bad-rel`,
    })).rejects.toThrow(/review-release-must-be-published/);

    // 若发布已是 PUBLISHED，允许关联
    await db.contentRelease.update({
      where: { id: releaseId },
      data: { stage: 'PUBLISHED', verifiedHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' },
    });

    const success = await reminders.createReview({
      actionId: action.id,
      releaseId,
      didWhat: '关联已确证发布版本',
      requestKey: `${TAG}req-good-rel`,
    });
    expect(success.releaseId).toBe(releaseId);
  });

  it('幂等重放：重复提交相同 requestKey 返回同一记录，不新增第二条', async () => {
    const action = await actions.create({ title: `${TAG}幂等事项` });
    const requestKey = `${TAG}req-idem`;

    const first = await reminders.createReview({
      actionId: action.id,
      didWhat: '首次提交复盘',
      requestKey,
    });

    const second = await reminders.createReview({
      actionId: action.id,
      didWhat: '重复提交复盘',
      requestKey,
    });

    expect(second.id).toBe(first.id);
    const count = await db.reviewEntry.count({ where: { actionId: action.id } });
    expect(count).toBe(1);
  });

  it('全局复盘列表可查，并支持按事项过滤', async () => {
    const act1 = await actions.create({ title: `${TAG}过滤测试 1` });
    const act2 = await actions.create({ title: `${TAG}过滤测试 2` });

    await reminders.createReview({ actionId: act1.id, didWhat: '复盘 A', requestKey: `${TAG}req-a` });
    await reminders.createReview({ actionId: act2.id, didWhat: '复盘 B', requestKey: `${TAG}req-b` });

    const all = await reminders.listReviews();
    expect(all.some((r) => r.actionId === act1.id)).toBe(true);
    expect(all.some((r) => r.actionId === act2.id)).toBe(true);

    const forAct1 = await reminders.listReviews({ actionId: act1.id });
    expect(forAct1).toHaveLength(1);
    expect(forAct1[0]!.didWhat).toBe('复盘 A');
  });
});
