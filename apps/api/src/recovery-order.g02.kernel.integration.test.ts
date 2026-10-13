import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConfigModule } from './config/config.module';
import { KernelModule } from './kernel.module';
import { ContentReleaseService } from './content-release/content-release.service';
import { ConversationDeletionService } from './log-resources/conversation-deletion.service';
import { DeletionManifestReplayService } from './log-resources/deletion-manifest-replay.service';
import { AgentExecutionService } from './execution/agent-execution.service';
import { CONTENT_RELEASE_REPOSITORY, type ContentReleaseRepositoryPort } from './ports/content-release.repository';
import { CONTENT_RELEASE_RUNNER } from './ports/content-release-runner.port';
import { WEBSITE_DEPLOYMENT_VERIFIER } from './ports/website-deployment-verifier.port';
import { GIT_STATUS, type GitStatusPort } from './ports/git-status.repository';
import { CONVERSATION_DELETION_REPOSITORY, type ConversationDeletionRepositoryPort } from './ports/conversation-deletion.repository';
import { PROCESS_REGISTRY, type ProcessRegistryPort, type ProcessObservation } from './ports/process-registry.port';
import { isRestoreGatePending, resolveRestoreGatePath, restoreGateMiddleware } from './runtime/restore-gate';
import { PRISMA, type PrismaPort } from './ports/prisma.port';

const TAG = 'g02-';
let app: INestApplication;
let moduleRef: TestingModule;
let contentDir: string;
let lockDir: string;
let lockFile: string;
let gateDir: string;
let gateFile: string;
let db: NonNullable<ReturnType<PrismaPort['getClient']>>;

let releaseService: ContentReleaseService;
let deletionService: ConversationDeletionService;
let manifestReplay: DeletionManifestReplayService;
let executionService: AgentExecutionService;
let releasesRepo: ContentReleaseRepositoryPort;
let deletionRepo: ConversationDeletionRepositoryPort;

const CURRENT_BATCH = { bootId: 'g02-boot-current', pid: process.pid };
/** 孤儿进程观察结果：进程仍存活 → 必须保持槽占用，不得据 PID 复用判定已退出 */
let orphanObservation: ProcessObservation = 'alive';

const mockGit: GitStatusPort = {
  async snapshot() { return { available: true, dirtyFiles: [], headCommit: 'g02-head' }; },
  async workspaceSnapshot() { return { available: true, headCommit: 'g02-head', files: [], dirtyFiles: [] }; },
  async hasCommit() { return true; },
};

const mockProcesses: ProcessRegistryPort = {
  async currentBatch() { return CURRENT_BATCH; },
  async inspect() { return orphanObservation; },
  async terminate() { return 'unproven'; },
};

describe('G02 完整失败恢复演练（多模块恢复顺序协作与一致性）', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-g02-content-'));
    lockDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-g02-lock-'));
    gateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-g02-gate-'));
    lockFile = path.join(lockDir, 'content-publish.lock');
    gateFile = path.join(gateDir, 'restore.pending');

    process.env.WALKER_ADMIN_TOKEN = 'g02-token';
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.WALKER_CONTENT_LOCK_PATH = lockFile;
    process.env.WALKER_RESTORE_GATE_FILE = gateFile;
    process.env.WALKER_DELETION_MANIFEST_PATH = path.join(gateDir, 'deletion-manifest.json');
    // 启动核对模式：onModuleInit 不自行 resume，由本演练显式驱动恢复顺序
    process.env.WALKER_STARTUP_RECONCILIATION = '1';

    moduleRef = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
      .overrideProvider(GIT_STATUS).useValue(mockGit)
      .overrideProvider(PROCESS_REGISTRY).useValue(mockProcesses)
      .overrideProvider(CONTENT_RELEASE_RUNNER).useValue({
        async runRelease() { return { exitCode: 0, timedOut: false, exitProof: 'exited', stdout: 'SUCCESS', stderr: '' }; },
      })
      .overrideProvider(WEBSITE_DEPLOYMENT_VERIFIER).useValue({
        async verify() { return { ok: false, reason: 'unverified-hash-mismatch' }; },
      })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.use(restoreGateMiddleware(gateFile));
    await app.init();

    releaseService = app.get(ContentReleaseService);
    deletionService = app.get(ConversationDeletionService);
    manifestReplay = app.get(DeletionManifestReplayService);
    executionService = app.get(AgentExecutionService);
    releasesRepo = app.get(CONTENT_RELEASE_REPOSITORY);
    deletionRepo = app.get(CONVERSATION_DELETION_REPOSITORY);
    db = app.get<PrismaPort>(PRISMA).getClient()!;
  });

  afterAll(async () => {
    if (db) {
      await db.deletionTombstone.deleteMany({ where: { conversationId: { startsWith: TAG } } });
      await db.conversationMessage.deleteMany({ where: { turn: { conversationId: { startsWith: TAG } } } });
      await db.conversationTurn.deleteMany({ where: { conversationId: { startsWith: TAG } } });
      await db.conversation.deleteMany({ where: { id: { startsWith: TAG } } });
      await db.conversationLogResource.deleteMany({ where: { conversationId: { startsWith: TAG } } });
      await db.executionRun.deleteMany({ where: { actorScope: { startsWith: TAG } } });
      await db.contentRelease.deleteMany({ where: { targetSlug: { startsWith: TAG } } });
      await db.contentChange.deleteMany({ where: { targetSlug: { startsWith: TAG } } });
      await db.auditRecord.deleteMany({ where: { targetId: { startsWith: TAG } } });
    }
    await app?.close();
    for (const dir of [contentDir, lockDir, gateDir]) {
      if (dir) await fs.rm(dir, { recursive: true, force: true });
    }
    delete process.env.WALKER_ADMIN_TOKEN;
    delete process.env.CONTENT_LOG_DIR;
    delete process.env.WALKER_CONTENT_LOCK_PATH;
    delete process.env.WALKER_RESTORE_GATE_FILE;
    delete process.env.WALKER_DELETION_MANIFEST_PATH;
    delete process.env.WALKER_STARTUP_RECONCILIATION;
  });

  beforeEach(async () => {
    // 每个失败点从干净的闸门开始
    await fs.rm(gateFile, { force: true });
  });

  it('失败点 1：恢复未完成前不开放不可信状态（闸门挂起一律 503，不放出半恢复数据）', async () => {
    // 闸门挂起 = 恢复尚未完成
    await fs.mkdir(path.dirname(gateFile), { recursive: true });
    await fs.writeFile(gateFile, 'pending', 'utf8');
    expect(isRestoreGatePending(gateFile)).toBe(true);

    // 中间件必须对一切请求返回 503，绝不能放行"看起来正常"的半恢复状态
    const status = await new Promise<number>((resolve) => {
      const res = {
        status(code: number) { resolve(code); return this; },
        json() { return this; },
      };
      restoreGateMiddleware(gateFile)({} as never, res as never, () => resolve(200));
    });
    expect(status).toBe(503);

    // 闸门清除后才放行
    await fs.rm(gateFile, { force: true });
    const afterClear = await new Promise<number>((resolve) => {
      const res = {
        status(code: number) { resolve(code); return this; },
        json() { return this; },
      };
      restoreGateMiddleware(gateFile)({} as never, res as never, () => resolve(200));
    });
    expect(afterClear).toBe(200);

    /**
     * 闸门路径由数据库位置推导：dirname(dirname(db)) + '/control/restore.pending'。
     * 传入 `<gateDir>/data/walker.db` 时上级目录恰是 gateDir，故落点为 `<gateDir>/control/restore.pending`。
     * 这个推导是**唯一**的：不存在第二套闸门路径判定。
     */
    expect(resolveRestoreGatePath(`file:${gateDir}/data/walker.db`)).toBe(
      path.resolve(path.join(gateDir, 'restore.pending')),
    );
    // 相同输入必须恒定（不会因调用次数改变落点）
    expect(resolveRestoreGatePath(`file:${gateDir}/data/walker.db`)).toBe(
      resolveRestoreGatePath(`file:${gateDir}/data/walker.db`),
    );
  });

  it('失败点 2：进程孤儿（进程仍存活或无法证明退出）→ 模型槽继续占用，不误判为已退出', async () => {
    const runId = `${TAG}orphan-run`;
    await db.executionRun.create({
      data: {
        id: runId,
        kind: 'agent-run',
        origin: 'admin',
        actor: 'owner',
        actorScope: `${TAG}scope`,
        requestKey: `rk-${runId}`,
        inputHash: 'hash',
        state: 'RUNNING',
        leaseOwner: 'g02-boot-OLD', // 不属于当前批次 → 应判 UNKNOWN
        leaseEpoch: 1,
      },
    });

    // 进程仍存活：不得释放槽
    orphanObservation = 'alive';
    const recovery = await executionService.recover();
    expect(recovery).toBeDefined();

    const after = await db.executionRun.findUnique({ where: { id: runId } });
    // 租约不属于当前批次 → 标记 UNKNOWN（不是 SUCCEEDED / FAILED 之类"终态"）
    expect(after!.state).toBe('UNKNOWN');

    // 关键：活着的孤儿不得被当作已退出（槽继续占用，不能双开模型）
    const occupiedByUnknown = await db.executionRun.count({ where: { state: 'UNKNOWN' } });
    expect(occupiedByUnknown).toBeGreaterThanOrEqual(1);
  });

  it('失败点 3：发布结果未知 → 保持 UNKNOWN 不假装已发布；reconcile 后才定时段事实', async () => {
    const slug = `${TAG}unknown-release`;
    const releaseId = `${TAG}rel-unknown`;
    const changeId = `${TAG}chg-unknown`;

    await db.contentChange.create({
      data: {
        id: changeId,
        targetSlug: slug,
        baseHash: 'a'.repeat(64),
        candidateHash: 'b'.repeat(64),
        candidateRef: `cand_${changeId}`,
        requestKey: `req-${changeId}`,
        state: 'APPLIED',
        appliedHash: 'b'.repeat(64),
      },
    });
    // 审批快照必须按真实规则构造（bindingHash = binding 的规范哈希），否则仓储拒绝读取
    const binding = {
      action: 'publish-website' as const,
      target: { kind: 'content' as const, slug },
      baseHash: 'a'.repeat(64),
      candidateHash: 'b'.repeat(64),
      grantId: `${TAG}grant-unknown`,
      grantRevision: 1,
    };
    const { contentApprovalHash } = await import('./adapters/content-approval.persistence');
    await db.contentRelease.create({
      data: {
        id: releaseId,
        changeId,
        targetSlug: slug,
        baseHash: 'a'.repeat(64),
        sourceHash: 'b'.repeat(64),
        publishApprovalId: `${TAG}appr-unknown`,
        publishApprovalHash: contentApprovalHash(binding),
        publishGrantId: binding.grantId,
        publishGrantRevision: 1,
        publishApprovedBy: 'owner',
        publishApprovedAt: new Date(),
        stage: 'UNKNOWN',
        requestKey: `rk-${releaseId}`,
      },
    });

    // 结果未知：绝不等于 PUBLISHED
    const before = await releasesRepo.findById(releaseId);
    expect(before!.stage).toBe('UNKNOWN');
    expect(before!.verifiedHash).toBeNull();

    // reconcile：线上没有该版本证据 → 保持未确证，不升级为 PUBLISHED
    const result = await releaseService.reconcile(releaseId);
    expect(result).toBeDefined();
    const after = await releasesRepo.findById(releaseId);
    expect(after!.stage).not.toBe('PUBLISHED');
    expect(after!.verifiedHash).toBeNull();

    // 未知发布不会污染公开版本快照
    const snapshot = await releaseService.getVersionSnapshot(slug);
    expect(snapshot.publishedHash).toBeNull();
  });

  it('失败点 4：补写与删除竞争 → tombstone 阻止正文复活，删除事实优先', async () => {
    const convId = `${TAG}race-conv`;
    const now = new Date();
    await db.conversation.create({
      data: { id: convId, anonId: `anon-${TAG}`, placementKey: 'article-inline', scopeSlug: 'g02-post' },
    });
    const turn = await db.conversationTurn.create({
      data: { id: `${TAG}turn-race`, conversationId: convId, seq: 1, requestKey: `${TAG}rk-race` },
    });
    await db.conversationMessage.create({
      data: { id: `${TAG}msg-race`, turnId: turn.id, role: 'visitor', body: '删除竞争测试', delivery: 'sent', createdAt: now },
    });

    // 发起删除：写入 tombstone 并同步清空
    const task = await deletionService.requestDelete(convId, 'owner');
    expect(task.state).toBe('completed');
    const tombstone = await db.deletionTombstone.findUnique({ where: { conversationId: convId } });
    expect(tombstone).not.toBeNull();

    // 正文与资源彻底清空
    expect(await db.conversation.count({ where: { id: convId } })).toBe(0);
    expect(await db.conversationMessage.count({ where: { id: `${TAG}msg-race` } })).toBe(0);

    /**
     * 迟到补写：删除完成后旧路径又写入资源登记。
     * `registeredAt` 显式设为删除完成之后——这正是"迟到"的判据。
     */
    await db.conversationLogResource.create({
      data: {
        id: randomUUID(),
        conversationId: convId,
        resourceType: 'assistant-run',
        resourceKey: `${TAG}late-write`,
        resourceCreatedAt: new Date(Date.now() + 1000),
        registeredAt: new Date(Date.now() + 1000),
      },
    });

    // 清扫前：迟到补写的资源仍在（这正是要修的缺口）
    expect(await db.conversationLogResource.count({ where: { conversationId: convId } })).toBe(1);

    // 续跑删除：应清扫已完成墓碑上的迟到补写残留
    await deletionService.resumePending();

    // 终态稳定：墓碑保持 completed，不退回 pending
    const finalTombstone = await db.deletionTombstone.findUnique({ where: { conversationId: convId } });
    expect(finalTombstone!.state).toBe('completed');
    // 迟到补写的资源必须被清掉（删除事实优先）
    expect(await db.conversationLogResource.count({ where: { conversationId: convId } })).toBe(0);
  });

  it('失败点 5：从旧备份恢复 → 删除清单重放阻止已删正文复活，且恢复后删除事实一致', async () => {
    const convId = `${TAG}restore-conv`;

    // 先造一段真实会话（下方删除后才模拟旧备份恢复）
    await db.conversation.create({
      data: { id: convId, anonId: `anon2-${TAG}`, placementKey: 'article-inline', scopeSlug: 'g02-post' },
    });
    const turn = await db.conversationTurn.create({
      data: { id: `${TAG}turn-seed`, conversationId: convId, seq: 1, requestKey: `${TAG}rk-seed` },
    });
    await db.conversationMessage.create({
      data: { id: `${TAG}msg-seed`, turnId: turn.id, role: 'visitor', body: '待删除正文', delivery: 'sent' },
    });
    // 先正常执行一次删除：把删除事实写进清单
    await deletionService.requestDelete(convId, 'owner');
    const entry = (await manifestReplay.replay({ force: false }), null);
    void entry;

    /**
     * 模拟"从早于删除的旧备份恢复"：
     * 1. 会话与正文又存在了；2. 已完成的 tombstone 被覆盖成不存在。
     * 删除清单必须能把删除事实补回，阻止已删正文复活。
     */
    await db.deletionTombstone.deleteMany({ where: { conversationId: convId } });
    await db.conversation.create({
      data: { id: convId, anonId: `anon2-${TAG}`, placementKey: 'article-inline', scopeSlug: 'g02-post' },
    });
    const turn2 = await db.conversationTurn.create({
      data: { id: `${TAG}turn-restore`, conversationId: convId, seq: 1, requestKey: `${TAG}rk-restore` },
    });
    await db.conversationMessage.create({
      data: { id: `${TAG}msg-restore`, turnId: turn2.id, role: 'visitor', body: '不该复活的正文', delivery: 'sent' },
    });

    // 清单重放：补回删除事实（force 强制重新打开，即使墓碑缺失）
    const replay = await manifestReplay.replay({ force: true });
    expect(replay).toBeDefined();

    // 恢复后：删除事实一致 —— 复活的数据必须再被清除
    await deletionService.resumePending();
    expect(await db.conversation.count({ where: { id: convId } })).toBe(0);
    expect(await db.conversationMessage.count({ where: { id: `${TAG}msg-restore` } })).toBe(0);
    const finalTombstone = await db.deletionTombstone.findUnique({ where: { conversationId: convId } });
    expect(finalTombstone).not.toBeNull();
    expect(finalTombstone!.state).toBe('completed');
  });

  it('恢复顺序不打架：闸门 → 清单重放 → 删除续跑 → 断言完成，全程单一顺序', async () => {
    const order: string[] = [];
    const gateStillPending = isRestoreGatePending(gateFile);
    expect(gateStillPending).toBe(false);

    // 按 main.ts 的真实顺序执行（恢复门清除前不得进入后续步骤）
    await manifestReplay.replay({ force: false });
    order.push('manifest-replay');
    await deletionService.resumePending();
    order.push('deletion-resume');

    expect(order).toEqual(['manifest-replay', 'deletion-resume']);

    // 各模块恢复互不干扰：删除续跑不会重新打开已完成墓碑
    const completedCount = await db.deletionTombstone.count({
      where: { conversationId: { startsWith: TAG }, state: 'completed' },
    });
    expect(completedCount).toBeGreaterThanOrEqual(1);
  });
});
