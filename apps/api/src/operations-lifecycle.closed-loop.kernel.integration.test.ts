import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeEach, beforeAll, describe, expect, it } from 'vitest';
import { publicItemHash, publicManifest, toPublicSnapshotSource } from '@walker/shared';
import matter from 'gray-matter';

import { ConfigModule } from './config/config.module';
import { KernelModule } from './kernel.module';
import { ContentAdminService } from './content-admin/content-admin.service';
import { CONTENT_MUTATION_SERVICE } from './ports/content-mutation.port';
import { ContentMutationService } from './content-mutation/content-mutation.service';
import { ContentReleaseService } from './content-release/content-release.service';
import { ReminderService } from './reminder/reminder.service';
import { ReminderScanService } from './reminder/reminder-scan.service';
import { ConversationActionService } from './reminder/conversation-action.service';
import { OperationsService } from './operations/operations.service';
import { ActionService } from './action/action.service';
import { ACTION_REPOSITORY, type ActionRepositoryPort } from './ports/action.repository';

import { CONTENT_FILE_REPOSITORY, type ContentFileRepositoryPort } from './ports/content-file.repository';
import { CANDIDATE_FILE_REPOSITORY, type CandidateFileRepositoryPort } from './ports/candidate-file.repository';
import { CONTENT_CHANGE_REPOSITORY, type ContentChangeRepositoryPort } from './ports/content-change.repository';
import { CONTENT_RELEASE_REPOSITORY, type ContentReleaseRepositoryPort } from './ports/content-release.repository';
import { GIT_STATUS, type GitStatusPort } from './ports/git-status.repository';
import { CONTENT_RELEASE_RUNNER, type ContentReleaseRunnerPort } from './ports/content-release-runner.port';
import { WEBSITE_DEPLOYMENT_VERIFIER, type WebsiteDeploymentVerifierPort } from './ports/website-deployment-verifier.port';
import { PUBLIC_SNAPSHOT_REPOSITORY, type PublicSnapshotRepositoryPort } from './ports/public-snapshot.repository';
import { PRISMA, type PrismaPort } from './ports/prisma.port';
import { newId } from './common/ids';

const TAG = 'o10-';
const token = 'o10-closed-loop-token';
let app: INestApplication;
let contentDir: string;
let candidateDir: string;
let snapshotDir: string;
let lockFile: string;
let moduleRef: TestingModule;

let adminService: ContentAdminService;
let mutationService: ContentMutationService;
let releaseService: ContentReleaseService;
let reminderService: ReminderService;
let scanService: ReminderScanService;
let convActionService: ConversationActionService;
let opsService: OperationsService;
let actionService: ActionService;
let actionRepo: ActionRepositoryPort;

let filesRepo: ContentFileRepositoryPort;
let changesRepo: ContentChangeRepositoryPort;
let candidateFilesRepo: CandidateFileRepositoryPort;
let releasesRepo: ContentReleaseRepositoryPort;
let publicSnapshotsRepo: PublicSnapshotRepositoryPort;
let db: NonNullable<ReturnType<PrismaPort['getClient']>>;

let currentGitHead = 'commit-o10-closed-loop-001';
let mockVerifierTargetHash: string | null = null;

const mockGitPort: GitStatusPort = {
  async snapshot() { return { available: true, dirtyFiles: [], headCommit: currentGitHead }; },
  async workspaceSnapshot() { return { available: true, headCommit: currentGitHead, files: [], dirtyFiles: [] }; },
  async hasCommit() { return true; },
};

const mockVerifier: WebsiteDeploymentVerifierPort = {
  async verify(_url, expected) {
    const expHash = expected?.expectedHash;
    if (mockVerifierTargetHash && expHash === mockVerifierTargetHash) {
      return { ok: true, verifiedHash: expHash };
    }
    return { ok: false, reason: 'unverified-hash-mismatch' };
  },
};

describe('O10 验收一次真实运营回路（全链路端到端闭环）', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-o10-content-'));
    candidateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-o10-candidates-'));
    snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-o10-snapshots-'));
    const runsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-o10-runs-'));
    const lockDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-o10-lock-'));
    lockFile = path.join(lockDir, 'content-publish.lock');

    process.env.WALKER_ADMIN_TOKEN = token;
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.WALKER_CANDIDATES_DIR = candidateDir;
    process.env.WALKER_PUBLIC_SNAPSHOT_DIR = snapshotDir;
    process.env.WALKER_RUNS_DIR = runsDir;
    process.env.WALKER_CONTENT_LOCK_PATH = lockFile;
    process.env.AI_ENABLED = 'false';
    delete process.env.WALKER_RESTORE_GATE_FILE;

    moduleRef = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
      .overrideProvider(GIT_STATUS).useValue(mockGitPort)
      .overrideProvider(WEBSITE_DEPLOYMENT_VERIFIER).useValue(mockVerifier)
      .overrideProvider(CONTENT_RELEASE_RUNNER).useValue({
        async runRelease() {
          return { exitCode: 0, timedOut: false, exitProof: 'exited', stdout: 'SUCCESS', stderr: '' };
        },
      })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');

    adminService = app.get(ContentAdminService);
    mutationService = app.get(CONTENT_MUTATION_SERVICE);
    releaseService = app.get(ContentReleaseService);
    reminderService = app.get(ReminderService);
    scanService = app.get(ReminderScanService);
    convActionService = app.get(ConversationActionService);
    opsService = app.get(OperationsService);
    actionService = app.get(ActionService);
    actionRepo = app.get(ACTION_REPOSITORY);

    filesRepo = app.get(CONTENT_FILE_REPOSITORY);
    changesRepo = app.get(CONTENT_CHANGE_REPOSITORY);
    candidateFilesRepo = app.get(CANDIDATE_FILE_REPOSITORY);
    releasesRepo = app.get(CONTENT_RELEASE_REPOSITORY);
    publicSnapshotsRepo = app.get(PUBLIC_SNAPSHOT_REPOSITORY);
    db = app.get<PrismaPort>(PRISMA).getClient()!;
  });

  afterAll(async () => {
    if (db) {
      await db.auditRecord.deleteMany({ where: { targetId: { startsWith: TAG } } });
      await db.reviewEntry.deleteMany({ where: { actionId: { startsWith: TAG } } });
      await db.reminderOccurrence.deleteMany({ where: { actionId: { startsWith: TAG } } });
      await db.action.deleteMany({ where: { id: { startsWith: TAG } } });
      await db.contentRelease.deleteMany({ where: { targetSlug: { startsWith: TAG } } });
      await db.contentChange.deleteMany({ where: { targetSlug: { startsWith: TAG } } });
      await db.conversationMessage.deleteMany({ where: { turn: { conversationId: { startsWith: TAG } } } });
      await db.conversationTurn.deleteMany({ where: { conversationId: { startsWith: TAG } } });
      await db.conversation.deleteMany({ where: { id: { startsWith: TAG } } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    if (candidateDir) await fs.rm(candidateDir, { recursive: true, force: true });
    if (snapshotDir) await fs.rm(snapshotDir, { recursive: true, force: true });
    if (lockFile) await fs.rm(path.dirname(lockFile), { recursive: true, force: true });
    delete process.env.WALKER_ADMIN_TOKEN;
    delete process.env.CONTENT_LOG_DIR;
    delete process.env.WALKER_CANDIDATES_DIR;
    delete process.env.WALKER_PUBLIC_SNAPSHOT_DIR;
    delete process.env.WALKER_CONTENT_LOCK_PATH;
  });

  beforeEach(async () => {
    await fs.rm(lockFile, { force: true });
  });

  it('全链路闭环运转：访客提问 → 显式转更新事项（带排期） → 扫描发生 → 到期处置 → 候选与审批 → 网页发布核验与快照同步 → 更新复盘 → 复盘建议显式转下一事项并设置提醒', async () => {
    const slug = `${TAG}real-loop-article`;
    const now = new Date();

    // ==========================================
    // 阶段 1：访客产生真实提问（未改动内容正本，不自动选题）
    // ==========================================
    const convId = `${TAG}conv-001`;
    await db.conversation.create({
      data: {
        id: convId,
        anonId: `anon-${TAG}1`,
        placementKey: 'article-inline',
        scopeSlug: slug,
        createdAt: now,
        updatedAt: now,
      },
    });
    const turn = await db.conversationTurn.create({
      data: { id: newId(), conversationId: convId, seq: 1, requestKey: `rk-${TAG}1`, createdAt: now },
    });
    const visitorMsg = await db.conversationMessage.create({
      data: {
        id: newId(),
        turnId: turn.id,
        role: 'visitor',
        body: '请问文章中提到的自动化脚本如何在 Windows 下执行？能否补充说明？',
        delivery: 'sent',
        createdAt: now,
      },
    });
    // 助手送达消息（delivery=ack，访客已确认收到）
    await db.conversationMessage.create({
      data: {
        id: newId(),
        turnId: turn.id,
        role: 'assistant',
        body: '可以通过 PowerShell 运行，但暂未包含脚本细节。',
        delivery: 'ack',
        createdAt: now,
      },
    });

    // ==========================================
    // 阶段 2：站主查看访客问题，显式转为更新事项（软引用、带排期）
    // ==========================================
    const preview = await convActionService.preview(convId);
    expect(preview.conversationId).toBe(convId);
    expect(preview.contentSlug).toBe(slug);
    expect(preview.summary).toContain('Windows 下执行');

    const convertRes = await convActionService.convert({
      conversationId: convId,
      title: `回应访客问题：补充 Windows 运行脚本`,
      plannedDate: '2026-10-01',
      messageIds: [visitorMsg.id],
      requestKey: `rk-${TAG}convert-1`,
      actor: 'owner',
    });
    expect(convertRes.replayed).toBe(false);
    const updateAction = convertRes.action;
    expect(updateAction.entityType).toBe('CONVERSATION');
    expect(updateAction.entityId).toBe(convId);
    expect(updateAction.plannedDate).toBe('2026-10-01');
    expect(updateAction.dueAt?.toISOString()).toBe('2026-09-30T16:00:00.000Z');

    // 验证从事项可追溯保留期内正文
    const evidence = await convActionService.evidence(updateAction.id);
    expect(evidence.available).toBe(true);
    expect(evidence.messages[0]!.body).toContain('Windows 下执行');

    // ==========================================
    // 阶段 3：提醒到期扫描与站主处置（延后/完成）
    // ==========================================
    // 到期扫描（模拟 2026-10-02 扫描到期未完成项）
    const scanResult = await scanService.scanOnce(new Date('2026-10-02T00:00:00Z'));
    expect(scanResult.created).toBeGreaterThanOrEqual(1);

    // 检查发生记录已生成
    const occs = await reminderService.listOccurrences(updateAction.id);
    expect(occs.length).toBe(1);
    expect(occs[0]!.outcome).toBe('PENDING');

    // 站主处置该提醒：延后 3 天至 2026-10-04
    const snoozeRes = await reminderService.dispose({
      actionId: updateAction.id,
      disposition: 'snooze',
      plannedDate: '2026-10-04',
      requestKey: `rk-${TAG}snooze-1`,
    });
    expect(snoozeRes.disposition).toBe('snooze');
    expect(snoozeRes.dueAt?.toISOString()).toBe('2026-10-03T16:00:00.000Z');

    // 站主完成行动并标记处置完成
    const completeRes = await reminderService.dispose({
      actionId: updateAction.id,
      disposition: 'complete',
      requestKey: `rk-${TAG}complete-1`,
    });
    expect(completeRes.disposition).toBe('complete');
    const actionFinished = await actionRepo.findById(updateAction.id);
    expect(actionFinished).not.toBeNull();
    expect(actionFinished!.status).toBe('DONE');

    // ==========================================
    // 阶段 4：内容变更、候选审批与受控写入
    // ==========================================
    // 先写入初始正本（通过 A02 门禁字段）
    const initialRaw = `---
title: 跨平台自动化运维实录
type: knowledge
form: article
domain: product
intent: share
valueMode: utility
visibility: public
aiUsePolicy:
  level: AI-2
  readable: true
  citable: true
created: '2026-09-01'
updated: '2026-09-26'
summary: 跨平台自动化运维实录初稿
---
# 初始正本
这里是一篇关于跨平台自动化运维的总结文章。
`;
    await adminService.save(slug, initialRaw, null);
    const initialDoc = await filesRepo.get(slug);
    expect(initialDoc).not.toBeNull();
    const baseHash = initialDoc!.hash;

    // 根据访客问题生成并应用候选（增加了 Windows 适配小节）
    const candidateRaw = `---
title: 跨平台自动化运维实录
type: knowledge
form: article
domain: product
intent: share
valueMode: utility
visibility: public
aiUsePolicy:
  level: AI-2
  readable: true
  citable: true
created: '2026-09-01'
updated: '2026-09-27'
summary: 跨平台自动化运维实录（含 Windows 适配）
---
# 初始正本
这里是一篇关于跨平台自动化运维的总结文章。

## Windows 运行适配
使用 PowerShell 7+ 执行 run-api.ps1 即可。
`;
    const candRecord = await candidateFilesRepo.save(`cand-${slug}`, candidateRaw);
    const changeId = `${TAG}chg-1`;
    const change = await changesRepo.createOnce({
      id: changeId,
      target: { kind: 'content', slug },
      baseHash,
      candidateHash: candRecord.hash,
      candidateRef: candRecord.candidateRef,
      sourceRunId: null,
      requestKey: `rk-${TAG}chg-req-1`,
    });

    const grantId = `${TAG}grant-${randomUUID().slice(0, 8)}`;
    await db.authorizationGrant.create({
      data: {
        id: grantId,
        revision: 1,
        principalType: 'user',
        principalId: 'owner',
        origin: 'admin',
        actions: ['content:approve', 'content:apply', 'content:publish'],
        resourceScope: { kind: 'content', ids: [slug] },
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const approved = await mutationService.approve({ changeId: change.id, grantId, actor: 'owner' });
    expect(approved.state).toBe('APPROVED');
    const applied = await mutationService.apply({ changeId: change.id, actor: 'owner', requestId: `req-${TAG}apply` });
    expect(applied.state).toBe('APPLIED');

    // 检验正本已更新且哈希匹配
    const updatedDoc = await filesRepo.get(slug);
    expect(updatedDoc!.hash).toBe(candRecord.hash);

    // ==========================================
    // 阶段 5：发布预检、全工作区发布锁与线上确证
    // ==========================================
    const preflight = await releaseService.preflight(slug);
    expect(preflight.ok).toBe(true);

    // 计算公开版本身份 (public projection hash)
    const parsedMatter = matter(candidateRaw);
    const targetSourceHash = publicItemHash(
      toPublicSnapshotSource({
        slug,
        data: parsedMatter.data,
        body: parsedMatter.content,
      }),
      (t) => createHash('sha256').update(t).digest('hex'),
    );

    // 准备发布记录并流转阶段
    const release = await releaseService.prepareRelease({
      slug,
      changeId: change.id,
      requestKey: `rk-${TAG}rel-req-1`,
    });
    expect(release.sourceHash).toBe(targetSourceHash);

    await releasesRepo.updateStage({ id: release.id, stage: 'COMMITTING', gitCommit: 'commit-o10-hash' });
    await releasesRepo.updateStage({ id: release.id, stage: 'PUSHED' });
    await releasesRepo.updateStage({ id: release.id, stage: 'VERIFYING' });

    // 线上核验器匹配预期 hash，发布成功确认
    mockVerifierTargetHash = targetSourceHash;

    const publicSource = toPublicSnapshotSource({
      slug,
      data: parsedMatter.data,
      body: parsedMatter.content,
    });
    const newManifest = publicManifest([publicSource], (t) => createHash('sha256').update(t).digest('hex'));

    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown) => {
      if (typeof input === 'string' && input.includes('public-manifest.json')) {
        return { ok: true, status: 200, json: async () => newManifest } as unknown as Response;
      }
      return origFetch(input as RequestInfo, {} as RequestInit);
    }) as typeof fetch;

    try {
      const verifyRes = await releaseService.verify(release.id);
      expect(verifyRes.verified).toBe(true);
      expect(verifyRes.stage).toBe('PUBLISHED');
      expect(verifyRes.assistantIndexState).toBe('SYNCED');
    } finally {
      globalThis.fetch = origFetch;
    }

    // ==========================================
    // 阶段 6：内容更新复盘（指标有来源，样本不足写未知）
    // ==========================================
    const review = await reminderService.createReview({
      actionId: updateAction.id,
      releaseId: release.id,
      didWhat: '补充了针对 Windows PowerShell 执行运维脚本的小节说明',
      observed: '相关问题的访客困惑明显减少，但 7d 内有效提问仅 3 次',
      windowStart: '2026-09-27',
      windowEnd: '2026-10-04',
      evidenceState: 'INSUFFICIENT',
      evidenceNote: '依据 /ops/overview 的 7d 统计，提问 3 次且交付确认 3 次，因样本量不足如实判定为 INSUFFICIENT',
      nextAttempt: '下阶段增加交互式命令自测沙盒',
      requestKey: `rk-${TAG}rev-1`,
      actor: 'owner',
    });
    expect(review.id).toBeDefined();
    expect(review.releaseId).toBe(release.id);
    expect(review.evidenceState).toBe('INSUFFICIENT');

    // ==========================================
    // 阶段 7：复盘建议显式转下一事项并设置提醒（形成正向闭环）
    // ==========================================
    const nextActionRes = await reminderService.convertReviewToAction({
      reviewId: review.id,
      title: '下一尝试：下阶段增加交互式命令自测沙盒',
      plannedDate: '2026-10-15',
      requestKey: `rk-${TAG}next-action-1`,
      actor: 'owner',
    });
    expect(nextActionRes.replayed).toBe(false);
    const nextAction = nextActionRes.action;
    expect(nextAction.entityType).toBe('REVIEW');
    expect(nextAction.entityId).toBe(review.id);
    expect(nextAction.plannedDate).toBe('2026-10-15');
    expect(nextAction.dueAt?.toISOString()).toBe('2026-10-14T16:00:00.000Z');

    // 从新事项可准确回溯原复盘
    const tracedReview = await reminderService.getReviewForAction(nextAction.id);
    expect(tracedReview).not.toBeNull();
    expect(tracedReview!.id).toBe(review.id);
    expect(tracedReview!.didWhat).toContain('Windows PowerShell 执行');

    // ==========================================
    // 阶段 8：运营统计（O06）指标验证全闭环数据真实可查
    // ==========================================
    const stats = await opsService.overview({ window: '30d' });
    expect(stats.asks.visitorMessages).toBeGreaterThanOrEqual(1);
    expect(stats.answers.deliveryAck).toBeGreaterThanOrEqual(1);
    expect(stats.reminders.open).toBeGreaterThanOrEqual(1); // 包含了新创建的 nextAction
    expect(stats.content.published).toBeGreaterThanOrEqual(1);
    expect(stats.content.stages.live).toBeGreaterThanOrEqual(1);
  });
});
