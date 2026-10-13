import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import matter from 'gray-matter';
import { publicItemHash, publicManifest, toPublicSnapshotSource } from '@walker/shared';
import { ConfigModule } from './config/config.module';
import { KernelModule } from './kernel.module';
import { ContentAdminService } from './content-admin/content-admin.service';
import { CONTENT_MUTATION_SERVICE } from './ports/content-mutation.port';
import { ContentMutationService } from './content-mutation/content-mutation.service';
import { ContentReleaseService } from './content-release/content-release.service';
import { CONTENT_FILE_REPOSITORY, type ContentFileRepositoryPort } from './ports/content-file.repository';
import { CANDIDATE_FILE_REPOSITORY, type CandidateFileRepositoryPort } from './ports/candidate-file.repository';
import { CONTENT_CHANGE_REPOSITORY, type ContentChangeRepositoryPort } from './ports/content-change.repository';
import { CONTENT_RELEASE_REPOSITORY, type ContentReleaseRepositoryPort } from './ports/content-release.repository';
import { AUTHORIZATION_REPOSITORY, type AuthorizationRepositoryPort } from './ports/authorization.repository';
import { GIT_STATUS, type GitStatusPort, type WorkspaceGitStatus } from './ports/git-status.repository';
import { CONTENT_RELEASE_RUNNER, type ContentReleaseRunnerPort, type ReleaseProcessResult } from './ports/content-release-runner.port';
import { WEBSITE_DEPLOYMENT_VERIFIER, type WebsiteDeploymentVerifierPort } from './ports/website-deployment-verifier.port';
import { PUBLIC_SNAPSHOT_REPOSITORY, type PublicSnapshotRepositoryPort } from './ports/public-snapshot.repository';
import { PRISMA, type PrismaPort } from './ports/prisma.port';

const token = 'c24-closed-loop-token';
let app: INestApplication;
let contentDir: string;
let candidateDir: string;
let snapshotDir: string;
let lockFile: string;
let moduleRef: TestingModule;
let adminService: ContentAdminService;
let mutationService: ContentMutationService;
let releaseService: ContentReleaseService;
let filesRepo: ContentFileRepositoryPort;
let changesRepo: ContentChangeRepositoryPort;
let candidateFilesRepo: CandidateFileRepositoryPort;
let releasesRepo: ContentReleaseRepositoryPort;
let publicSnapshotsRepo: PublicSnapshotRepositoryPort;

let currentGitHead = 'commit-c24-closed-loop-001';
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

describe('C24 完整内容更新闭环验收（K6 端到端 Kernel 集成演练）', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c24-content-'));
    candidateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c24-candidates-'));
    snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c24-snapshots-'));
    const runsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c24-runs-'));
    const lockDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c24-lock-'));
    lockFile = path.join(lockDir, 'content-publish.lock');

    process.env.WALKER_ADMIN_TOKEN = token;
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.WALKER_CANDIDATES_DIR = candidateDir;
    process.env.WALKER_PUBLIC_SNAPSHOT_DIR = snapshotDir;
    process.env.WALKER_RUNS_DIR = runsDir;
    process.env.WALKER_CONTENT_LOCK_PATH = lockFile;

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
    filesRepo = app.get(CONTENT_FILE_REPOSITORY);
    changesRepo = app.get(CONTENT_CHANGE_REPOSITORY);
    candidateFilesRepo = app.get(CANDIDATE_FILE_REPOSITORY);
    releasesRepo = app.get(CONTENT_RELEASE_REPOSITORY);
    publicSnapshotsRepo = app.get(PUBLIC_SNAPSHOT_REPOSITORY);
  });

  afterAll(async () => {
    const db = app?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.auditRecord.deleteMany({ where: { targetId: { startsWith: 'c24-' } } });
      await db.contentRelease.deleteMany({ where: { targetSlug: { startsWith: 'c24-' } } });
      await db.contentChange.deleteMany({ where: { targetSlug: { startsWith: 'c24-' } } });
      await db.authorizationGrant.deleteMany({ where: { id: { startsWith: 'c24-' } } });
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

  it('完整闭环跑通：人工编辑 → 候选生成 → 差异审批与消费 → 受控保存 → 范围预检与清单 → 独立发布批准 → 发布阶段推进 → 线上核验 → 问答快照同步', async () => {
    const slug = 'c24-full-lifecycle-post';
    const db = app.get<PrismaPort>(PRISMA).getClient()!;

    // 步骤 1：人工编辑与初稿受控保存（A02 门禁）
    const initialDraft = `---
title: C24 完整闭环演练文章
type: knowledge
form: article
domain: product
intent: share
valueMode: utility
aiUsePolicy:
  level: AI-2
  readable: true
  citable: true
updated: '2026-09-26'
summary: C24 验收测试初稿
---
# 第一版初稿正文
这是人工撰写的第一版正文。
`;
    const saved1 = await adminService.save(slug, initialDraft, null);
    expect(saved1.slug).toBe(slug);
    expect(saved1.hash).toMatch(/^[a-f0-9]{64}$/);

    // 核验三版本初始状态：正本存在但尚未发布上线
    const version0 = await releaseService.getVersionSnapshot(slug);
    expect(version0.workingHash).toBe(saved1.hash);
    expect(version0.publishedHash).toBeNull();
    expect(version0.indexedHash).toBeNull();

    // 步骤 2：Agent 候选生成（A11 候选独立，不覆盖正本）
    const candidateText = `---
title: C24 完整闭环演练文章
type: knowledge
form: article
domain: product
intent: share
valueMode: utility
aiUsePolicy:
  level: AI-2
  readable: true
  citable: true
updated: '2026-09-26'
summary: C24 验收测试候选已优化
---
# 优化后的第二版正文
这是 Agent 根据指令生成的更高质量候选正文段落。
`;
    const candRecord = await candidateFilesRepo.save(`cand-${slug}`, candidateText);
    const change = await changesRepo.createOnce({
      id: `c24-chg-${randomUUID().slice(0, 8)}`,
      target: { kind: 'content', slug },
      baseHash: saved1.hash,
      candidateHash: candRecord.hash,
      candidateRef: candRecord.candidateRef,
      sourceRunId: 'run-c24-source',
      requestKey: `c24-req-${randomUUID().slice(0, 8)}`,
    });
    expect(change.state).toBe('PROPOSED');
    // 正本逐字节不变
    const docBeforeApprove = await filesRepo.get(slug);
    expect(docBeforeApprove?.hash).toBe(saved1.hash);

    // 步骤 3：差异审批与一次性消费（A12 审批绑定与原子消费）
    const grantId = `c24-grant-${randomUUID().slice(0, 8)}`;
    await db.authorizationGrant.create({
      data: {
        id: grantId,
        revision: 1,
        principalType: 'owner',
        principalId: 'owner',
        agentId: 'agent-c24',
        origin: 'admin',
        actions: ['content:approve', 'content:apply', 'content:publish'],
        resourceScope: { kind: 'content', ids: [slug] },
        expiresAt: new Date(Date.now() + 3600_000),
        runLimit: 1,
        usageLimit: 1000,
      },
    });

    // 批准候选
    const approved = await mutationService.approve({ changeId: change.id, grantId, actor: 'owner' });
    expect(approved.state).toBe('APPROVED');
    expect(approved.applyApproval?.binding.candidateHash).toBe(candRecord.hash);

    // 应用候选到工作区
    const applied = await mutationService.apply({ changeId: change.id, actor: 'owner', requestId: 'req-apply-c24' });
    expect(applied.state).toBe('APPLIED');
    expect(applied.appliedHash).toBe(candRecord.hash);

    // 正本更新为候选内容
    const docAfterApply = await filesRepo.get(slug);
    expect(docAfterApply?.hash).toBe(candRecord.hash);

    // 步骤 4：实际发布范围预检与稳定清单生成（C12）
    const preflight = await releaseService.preflight(slug);
    expect(preflight.ok).toBe(true);
    expect(preflight.manifest).toBeDefined();
    expect(preflight.manifest?.targetSlug).toBe(slug);
    expect(preflight.manifest?.targetHash).toBe(candRecord.hash);
    expect(preflight.manifest?.items.length).toBeGreaterThan(0);

    // 步骤 5：独立发布批准与发布准备（C20 / A02）
    const preparedRel = await releaseService.prepareRelease({
      slug,
      grantId,
      actor: 'owner',
      requestKey: `rel-req-${slug}`,
    });
    expect(preparedRel.id).toBeDefined();
    expect(preparedRel.stage).toBe('PREPARED');
    expect(preparedRel.publishApproval.binding.action).toBe('publish-website');
    // 发布绑定的公开版本身份（与线上 content-hash 同口径），不是文件内容 hash；
    // 文件版本由 changeId → change.appliedHash 追溯，两者必须都被绑定。
    expect(preparedRel.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(preparedRel.sourceHash).not.toBe(candRecord.hash);
    const boundChange = await changesRepo.findById(preparedRel.changeId);
    expect(boundChange?.appliedHash).toBe(candRecord.hash);

    // 步骤 6：触发发布上线并推进状态机（C14）
    const releaseResult = await releaseService.release({
      slug,
      releaseId: preparedRel.id,
    });
    expect(releaseResult.status).toBe('RUNNING');
    expect(releaseResult.runId).toMatch(/^run_/);

    // 等待真正的假 runner 经服务推进到 VERIFYING；测试不能与异步执行器抢写阶段。
    await vi.waitFor(async () => {
      expect((await releasesRepo.findById(preparedRel.id))?.stage).toBe('VERIFYING');
    }, { timeout: 3_000 });

    // 步骤 7：线上版本核验器与问答快照自动同步切换（C16/C17/A16）
    // 线上证据 = 与构建期同一套公开投影规则产出的内容 hash（不再手改 DB 迁就实现）
    const publishedRaw = await fs.readFile(path.join(contentDir, `${slug}.md`), 'utf8');
    const { data: publishedData, content: publishedBody } = matter(publishedRaw);
    const publicSource = toPublicSnapshotSource({
      slug,
      data: publishedData as Record<string, unknown>,
      body: publishedBody,
    });
    const manifestItemHash = publicItemHash(publicSource, (text) => createHash('sha256').update(text).digest('hex'));

    // 线上 manifest 由构建期同一份规则产出
    const newManifest = publicManifest([publicSource], (text) => createHash('sha256').update(text).digest('hex'));
    expect(newManifest.items[0]!.hash).toBe(manifestItemHash);
    // 发布记录绑定的公开版本必须与线上证据同口径（这正是修复的接缝）
    expect(preparedRel.sourceHash).toBe(manifestItemHash);
    mockVerifierTargetHash = manifestItemHash;

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('public-manifest.json')) {
        return { ok: true, status: 200, json: async () => newManifest } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    }));

    const verifyRes = await releaseService.verify(preparedRel.id);
    expect(verifyRes.verified).toBe(true);
    expect(verifyRes.stage).toBe('PUBLISHED');
    expect(verifyRes.verifiedHash).toBe(manifestItemHash);
    expect(verifyRes.assistantIndexState).toBe('SYNCED');
    expect(verifyRes.publishedSnapshotId).toBeDefined();

    // 最终三版本事实核验：全链路同步完成！
    const finalVersion = await releaseService.getVersionSnapshot(slug);
    expect(finalVersion.workingHash).toBe(candRecord.hash);
    expect(finalVersion.publishedHash).toBe(manifestItemHash);
    expect(finalVersion.indexedHash).toBe(manifestItemHash);
  });
});
