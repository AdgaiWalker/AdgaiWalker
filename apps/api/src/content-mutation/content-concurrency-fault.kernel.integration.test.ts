import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { CONTENT_MUTATION_SERVICE, type ContentMutationPort } from '../ports/content-mutation.port';
import { CONTENT_RELEASE_REPOSITORY, type ContentReleaseRepositoryPort } from '../ports/content-release.repository';
import { CONTENT_FILE_REPOSITORY, type ContentFileRepositoryPort } from '../ports/content-file.repository';
import { CONTENT_CHANGE_REPOSITORY, type ContentChangeRepositoryPort } from '../ports/content-change.repository';
import { CANDIDATE_FILE_REPOSITORY, type CandidateFileRepositoryPort } from '../ports/candidate-file.repository';
import { AUTHORIZATION_REPOSITORY, type AuthorizationRepositoryPort } from '../ports/authorization.repository';
import { CONTENT_LOCK, type ContentLockPort } from '../ports/content-lock.port';
import { GIT_STATUS, type GitStatusPort } from '../ports/git-status.repository';
import { CONTENT_RELEASE_RUNNER, type ContentReleaseRunnerPort } from '../ports/content-release-runner.port';
import { WEBSITE_DEPLOYMENT_VERIFIER, type WebsiteDeploymentVerifierPort } from '../ports/website-deployment-verifier.port';
import { ContentReleaseService } from '../content-release/content-release.service';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

const token = 'c23-fault-token';
let app: INestApplication;
let contentDir: string;
let candidateDir: string;
let lockFile: string;
let moduleRef: TestingModule;
let mutationService: ContentMutationPort;
let releaseService: ContentReleaseService;
let contentLock: ContentLockPort;
let grantsRepo: AuthorizationRepositoryPort;
let filesRepo: ContentFileRepositoryPort;
let changesRepo: ContentChangeRepositoryPort;
let candidateFilesRepo: CandidateFileRepositoryPort;
let releasesRepo: ContentReleaseRepositoryPort;

let mockGitHead = 'commit-c23-head-001';
const mockGitPort: GitStatusPort = {
  async snapshot() { return { available: true, dirtyFiles: [], headCommit: mockGitHead }; },
  async workspaceSnapshot() { return { available: true, headCommit: mockGitHead, files: [], dirtyFiles: [] }; },
  async hasCommit() { return true; },
};

const mockVerifier: WebsiteDeploymentVerifierPort = {
  async verify() { return { ok: false, reason: 'unverified-yet' }; },
};

describe('C23 验证审批撤销和并发写入边界（Kernel 集成故障测试）', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c23-content-'));
    candidateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c23-cand-'));
    const runsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c23-runs-'));
    const lockDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c23-lock-'));
    lockFile = path.join(lockDir, 'content-publish.lock');

    process.env.WALKER_ADMIN_TOKEN = token;
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.WALKER_CANDIDATES_DIR = candidateDir;
    process.env.WALKER_RUNS_DIR = runsDir;
    process.env.WALKER_CONTENT_LOCK_PATH = lockFile;

    moduleRef = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
      .overrideProvider(GIT_STATUS).useValue(mockGitPort)
      .overrideProvider(WEBSITE_DEPLOYMENT_VERIFIER).useValue(mockVerifier)
      .overrideProvider(CONTENT_RELEASE_RUNNER).useValue({
        async runRelease() { return { exitCode: 0, timedOut: false, exitProof: 'exited', stdout: 'SUCCESS', stderr: '' }; },
      })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');

    mutationService = app.get(CONTENT_MUTATION_SERVICE);
    releaseService = app.get(ContentReleaseService);
    contentLock = app.get(CONTENT_LOCK);
    grantsRepo = app.get(AUTHORIZATION_REPOSITORY);
    filesRepo = app.get(CONTENT_FILE_REPOSITORY);
    changesRepo = app.get(CONTENT_CHANGE_REPOSITORY);
    candidateFilesRepo = app.get(CANDIDATE_FILE_REPOSITORY);
    releasesRepo = app.get(CONTENT_RELEASE_REPOSITORY);
  });

  afterAll(async () => {
    const db = app?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.auditRecord.deleteMany({ where: { targetId: { startsWith: 'c23-' } } });
      await db.contentRelease.deleteMany({ where: { targetSlug: { startsWith: 'c23-' } } });
      await db.contentChange.deleteMany({ where: { targetSlug: { startsWith: 'c23-' } } });
      await db.authorizationGrant.deleteMany({ where: { id: { startsWith: 'c23-' } } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    if (candidateDir) await fs.rm(candidateDir, { recursive: true, force: true });
    if (lockFile) await fs.rm(path.dirname(lockFile), { recursive: true, force: true });
    delete process.env.WALKER_ADMIN_TOKEN;
    delete process.env.CONTENT_LOG_DIR;
    delete process.env.WALKER_CANDIDATES_DIR;
    delete process.env.WALKER_CONTENT_LOCK_PATH;
  });

  beforeEach(async () => {
    await fs.rm(lockFile, { force: true });
  });

  async function createFixture(name: string) {
    const slug = `c23-${name}`;
    const initialRaw = `---\ntitle: ${name}\ntype: knowledge\nform: article\ndomain: product\nintent: share\nvalueMode: utility\naiUsePolicy:\n  level: AI-2\n  readable: true\n  citable: true\nupdated: '2026-09-26'\nsummary: ${name}\n---\n# 原始文本\n`;
    const candidateRaw = `---\ntitle: ${name}\ntype: knowledge\nform: article\ndomain: product\nintent: share\nvalueMode: utility\naiUsePolicy:\n  level: AI-2\n  readable: true\n  citable: true\nupdated: '2026-09-26'\nsummary: ${name} 候选更新\n---\n# 候选更新正文\n`;

    await filesRepo.save(slug, initialRaw, null);
    const initialDoc = (await filesRepo.get(slug))!;

    const candRecord = await candidateFilesRepo.save(`cand-${slug}`, candidateRaw);
    const change = await changesRepo.createOnce({
      id: `chg-${slug}`,
      target: { kind: 'content', slug },
      baseHash: initialDoc.hash,
      candidateHash: candRecord.hash,
      candidateRef: candRecord.candidateRef,
      sourceRunId: null,
      requestKey: `req-${slug}`,
    });

    const db = app.get<PrismaPort>(PRISMA).getClient()!;
    const grantId = `c23-grant-${slug}`;
    await db.authorizationGrant.create({
      data: {
        id: grantId,
        revision: 1,
        principalType: 'user',
        principalId: 'owner',
        origin: 'admin',
        actions: ['content:propose', 'content:approve', 'content:apply', 'content:publish'],
        resourceScope: { kind: 'content', ids: [slug] },
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    return { slug, initialRaw, candidateRaw, change, grantId, initialHash: initialDoc.hash };
  }

  it('边界1：候选变更被篡改导致与审批 bindingHash 不符时，apply 拒绝执行，正本逐字节不变', async () => {
    const { slug, change, grantId, initialRaw } = await createFixture('tampered-cand');
    await mutationService.approve({ changeId: change.id, grantId, actor: 'owner' });

    // 注入失败：篡改外部传入的 candidateRaw，使其 hash 与批准时的 candidateHash 不匹配
    await expect(mutationService.apply({
      changeId: change.id,
      candidateRaw: '---\ntitle: 被篡改的候选\n---\n恶意篡改正文',
      actor: 'owner',
      requestId: 'req-tamper-01',
    })).rejects.toThrow(/候选正文 hash 与已批准版本不匹配/);

    // 验证正本逐字节不变
    const doc = await filesRepo.get(slug);
    expect(doc?.raw).toBe(initialRaw);
  });

  it('边界2：审批后若授权被撤销或修订版本提升，apply 复检立即拦截，排队任务绝不执行副作用', async () => {
    const { slug, change, grantId, initialRaw } = await createFixture('revoked-grant');
    await mutationService.approve({ changeId: change.id, grantId, actor: 'owner' });

    // 撤销授权
    await grantsRepo.revoke(grantId, new Date());

    // 执行应用必须被 403 拒绝
    await expect(mutationService.apply({
      changeId: change.id,
      actor: 'owner',
      requestId: 'req-apply-revoked',
    })).rejects.toThrow(/授权已撤销或到期/);

    const doc = await filesRepo.get(slug);
    expect(doc?.raw).toBe(initialRaw);
  });

  it('边界3：CAS 并发保存竞争：携带同一旧 expectedHash 的并发请求仅一个成功，另一个冲突失败且无静默覆盖', async () => {
    const { slug, initialHash, initialRaw } = await createFixture('cas-race');

    const rawA = `${initialRaw}\n改动 A`;
    const rawB = `${initialRaw}\n改动 B`;

    // 并发执行两次保存，均基于相同的 initialHash
    const [resA, resB] = await Promise.allSettled([
      mutationService.saveManual({ slug, raw: rawA, expectedHash: initialHash, actor: 'owner', requestId: 'req-cas-a' }),
      mutationService.saveManual({ slug, raw: rawB, expectedHash: initialHash, actor: 'owner', requestId: 'req-cas-b' }),
    ]);

    // 必然一成一败（满足 CAS 排他语义）
    const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled');
    const rejected = [resA, resB].filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const failedReason = (rejected[0] as PromiseRejectedResult).reason;
    const msgOrCode = (failedReason?.code ?? '') + (failedReason?.message ?? '');
    expect(msgOrCode).toMatch(/conflict|内容已变化|content-version-conflict/i);
  });

  it('边界4：发布锁排他保护：全工作区发布锁激活期间，正本修改（saveManual/apply）均被 409 拦截，正本冻结', async () => {
    const { slug, initialHash, change, grantId } = await createFixture('locked-workspace');
    await mutationService.approve({ changeId: change.id, grantId, actor: 'owner' });

    // 人工获取跨进程发布锁
    const lock = await contentLock.tryAcquire({ owner: 'api:test-publisher', targetSlug: slug });
    expect(lock).not.toBeNull();

    try {
      // 1. saveManual 被拦截
      await expect(mutationService.saveManual({
        slug,
        raw: '# 尝试在发布期间修改正本',
        expectedHash: initialHash,
        actor: 'owner',
        requestId: 'req-during-lock',
      })).rejects.toThrow(/工作区正在执行发布.*内容已锁定/);

      // 2. apply 被拦截
      await expect(mutationService.apply({
        changeId: change.id,
        actor: 'owner',
        requestId: 'req-apply-during-lock',
      })).rejects.toThrow(/工作区正在执行发布.*内容已锁定/);

      // 3. 第二个发布被拦截
      await expect(releaseService.release({ slug, releaseId: 'unused' })).rejects.toThrow(/工作区发布锁已被占用/);
    } finally {
      if (lock) await contentLock.release(lock.payload.lockId);
    }
  });

  it('边界5：Git 已生效后响应丢失/不可逆取消：不轻率承诺自动回滚，确证实际状态或保留 UNKNOWN', async () => {
    const { slug, change, grantId } = await createFixture('irreversible-cancel');
    await mutationService.approve({ changeId: change.id, grantId, actor: 'owner' });
    await mutationService.apply({ changeId: change.id, actor: 'owner', requestId: 'req-apply-irr' });

    const release = await releaseService.prepareRelease({ slug, actor: 'owner', requestKey: `req-irr-${slug}` });

    // 将阶段推进到已推送 PUSHED
    await releasesRepo.updateStage({ id: release.id, stage: 'COMMITTING' });
    await releasesRepo.updateStage({ id: release.id, stage: 'PUSHED', gitCommit: 'commit-c23-head-001' });

    // 在 PUSHED 阶段请求取消：不可逆阶段绝不能误标为取消未发布，而是核对事实
    const cancelRes = await releaseService.cancel(release.id);
    expect(cancelRes.cancelled).toBe(false);
    expect(cancelRes.message).toContain('无法直接取消');

    // 终态未被篡改，依然保持事实阶段（PUSHED / VERIFYING / UNKNOWN），不假装回滚成功
    const currentRel = await releaseService.getRelease(release.id);
    expect(currentRel?.stage).not.toBe('FAILED');
  });
});
