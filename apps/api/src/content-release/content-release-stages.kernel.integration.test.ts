import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { ContentReleaseService } from './content-release.service';
import { CONTENT_RELEASE_REPOSITORY, type ContentReleaseRepositoryPort } from '../ports/content-release.repository';
import { CONTENT_CHANGE_REPOSITORY, type ContentChangeRepositoryPort } from '../ports/content-change.repository';
import { GIT_STATUS, type GitStatusPort, type WorkspaceGitStatus } from '../ports/git-status.repository';
import { CONTENT_RELEASE_RUNNER, type ContentReleaseRunnerPort, type ReleaseProcessResult } from '../ports/content-release-runner.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { contentApprovalHash } from '../adapters/content-approval.persistence';
import { WEBSITE_DEPLOYMENT_VERIFIER } from '../ports/website-deployment-verifier.port';

const token = 'c14-stages-token';
let app: INestApplication;
let contentDir: string;
let lockFile: string;
let moduleRef: TestingModule;
let service: ContentReleaseService;
let releasesRepo: ContentReleaseRepositoryPort;
let changesRepo: ContentChangeRepositoryPort;

class ControllableRunner implements ContentReleaseRunnerPort {
  calls = 0;
  private pendingResult?: ReleaseProcessResult;
  private resolver?: (res: ReleaseProcessResult) => void;

  async runRelease(): Promise<ReleaseProcessResult> {
    this.calls += 1;
    if (this.pendingResult) {
      const res = this.pendingResult;
      this.pendingResult = undefined;
      return res;
    }
    return new Promise<ReleaseProcessResult>((resolve) => {
      this.resolver = resolve;
    });
  }

  finish(result: ReleaseProcessResult) {
    if (this.resolver) {
      this.resolver(result);
      this.resolver = undefined;
    } else {
      this.pendingResult = result;
    }
  }

  reset() {
    this.calls = 0;
    this.pendingResult = undefined;
    this.resolver = undefined;
  }
}

const runner = new ControllableRunner();

const fakeGitStatus: WorkspaceGitStatus = {
  available: true,
  headCommit: 'commit-c14-abc1234567890',
  files: [{ path: 'content/log/c14-stage-post.md', staged: false, dirty: true, statusCode: ' M' }],
  dirtyFiles: ['content/log/c14-stage-post.md'],
};

const mockGitPort: GitStatusPort = {
  async snapshot() {
    return { available: true, dirtyFiles: ['c14-stage-post.md'], headCommit: fakeGitStatus.headCommit };
  },
  async workspaceSnapshot() {
    return { ...fakeGitStatus };
  },
};

const VALID_POST = `---
title: 阶段文章
type: knowledge
visibility: public
form: article
domain: product
intent: share
valueMode: utility
aiUsePolicy:
  level: AI-2
  readable: true
  citable: true
updated: '2026-09-25'
summary: 阶段文章摘要
---
# 正文内容
`;

describe('C14 发布阶段与幂等脚本调用', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c14-content-'));
    const runsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c14-runs-'));
    const lockDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c14-lock-'));
    lockFile = path.join(lockDir, 'content-publish.lock');

    process.env.WALKER_ADMIN_TOKEN = token;
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.WALKER_RUNS_DIR = runsDir;
    process.env.WALKER_CONTENT_LOCK_PATH = lockFile;

    await fs.writeFile(path.join(contentDir, 'c14-stage-post.md'), VALID_POST, 'utf8');

    moduleRef = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
      .overrideProvider(GIT_STATUS).useValue(mockGitPort)
      .overrideProvider(CONTENT_RELEASE_RUNNER).useValue(runner)
      .overrideProvider(WEBSITE_DEPLOYMENT_VERIFIER).useValue({ async verify() { return { ok: false, reason: 'not-deployed' }; } })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');

    service = app.get(ContentReleaseService);
    releasesRepo = app.get(CONTENT_RELEASE_REPOSITORY);
    changesRepo = app.get(CONTENT_CHANGE_REPOSITORY);
  });

  afterAll(async () => {
    const db = app?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.auditRecord.deleteMany({ where: { targetId: { startsWith: 'c14-' } } });
      await db.contentRelease.deleteMany({ where: { targetSlug: { startsWith: 'c14-' } } });
      await db.contentChange.deleteMany({ where: { targetSlug: { startsWith: 'c14-' } } });
      await db.authorizationGrant.deleteMany({ where: { id: { startsWith: 'c14-' } } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    if (lockFile) await fs.rm(path.dirname(lockFile), { recursive: true, force: true });
    delete process.env.WALKER_ADMIN_TOKEN;
    delete process.env.CONTENT_LOG_DIR;
    delete process.env.WALKER_CONTENT_LOCK_PATH;
  });

  beforeEach(async () => {
    await fs.rm(lockFile, { force: true });
    runner.reset();
  });

  async function createFixtureRelease(slug: string) {
    const db = app.get<PrismaPort>(PRISMA).getClient()!;
    const grantId = `c14-grant-${randomUUID().slice(0, 8)}`;
    await db.authorizationGrant.create({
      data: {
        id: grantId,
        revision: 1,
        principalType: 'user',
        principalId: 'owner',
        origin: 'admin',
        actions: ['content:apply', 'content:publish'],
        resourceScope: { type: 'content', id: slug },
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const baseHash = 'a'.repeat(64);
    const candidateHash = createHash('sha256').update(VALID_POST).digest('hex');
    const publicHash = (await service.preflight(slug)).publicHash!;

    const change = await changesRepo.createOnce({
      id: `c14-chg-${randomUUID().slice(0, 8)}`,
      target: { kind: 'content', slug },
      baseHash,
      candidateHash,
      candidateRef: 'cand-ref-c14',
      sourceRunId: 'run-source',
      requestKey: `c14-req-${randomUUID().slice(0, 8)}`,
    });

    // 伪造 APPLIED 候选：view() 要求 APPROVED/APPLYING/APPLIED/UNKNOWN 必须带完整批准快照
    const applyBinding = {
      action: 'apply-candidate' as const,
      target: { kind: 'content' as const, slug },
      baseHash,
      candidateHash,
      grantId,
      grantRevision: 1,
    };
    await db.contentChange.update({
      where: { id: change.id },
      data: {
        state: 'APPLIED',
        appliedHash: candidateHash,
        applyApprovalId: `c14-apply-${randomUUID().slice(0, 8)}`,
        applyApprovalHash: contentApprovalHash(applyBinding),
        applyGrantId: grantId,
        applyGrantRevision: 1,
        applyApprovedBy: 'owner',
        applyApprovedAt: new Date(),
      },
    });

    const release = await releasesRepo.createOnce({
      id: `c14-rel-${randomUUID().slice(0, 8)}`,
      changeId: change.id,
      target: { kind: 'content', slug },
      baseHash,
      sourceHash: publicHash,
      requestKey: `c14-pub-req-${randomUUID().slice(0, 8)}`,
      publishApproval: (() => {
        const binding = {
          action: 'publish-website' as const,
          target: { kind: 'content' as const, slug },
          baseHash,
          candidateHash: publicHash,
          grantId: 'grant-publish-owner',
          grantRevision: 1,
        };
        return {
          id: `c14-appr-${randomUUID().slice(0, 8)}`,
          binding,
          bindingHash: contentApprovalHash(binding),
          approvedBy: 'owner',
          approvedAt: new Date().toISOString(),
        };
      })(),
    });

    return { change, release };
  }

  it('批准后正本改变时拒绝执行，保留 PREPARED 且不启动脚本', async () => {
    const slug = 'c14-stage-post';
    const { release } = await createFixtureRelease(slug);
    const full = path.join(contentDir, `${slug}.md`);
    await fs.writeFile(full, VALID_POST + '\n批准后修改\n', 'utf8');
    try {
      await expect(service.release({ slug, releaseId: release.id })).rejects.toMatchObject({
        response: { code: 'content-release-conflict' },
      });
      expect(runner.calls).toBe(0);
      expect((await releasesRepo.findById(release.id))?.stage).toBe('PREPARED');
    } finally {
      await fs.writeFile(full, VALID_POST, 'utf8');
    }
  });

  it('显式 L2 授权在批准后撤销时执行拒绝', async () => {
    const slug = 'c14-stage-post';
    const db = app.get<PrismaPort>(PRISMA).getClient()!;
    const grantId = `c14-grant-${randomUUID().slice(0, 8)}`;
    await db.authorizationGrant.create({ data: {
      id: grantId, principalType: 'owner', principalId: 'owner', agentId: 'agent-c14',
      origin: 'admin', actions: ['content:publish'], resourceScope: { kind: 'content', ids: [slug] },
      expiresAt: new Date(Date.now() + 3_600_000), runLimit: 1, usageLimit: 1000,
    } });
    const release = await service.prepareRelease({ slug, grantId, requestKey: `c14-explicit-${randomUUID()}` });
    await db.authorizationGrant.update({ where: { id: grantId }, data: { revokedAt: new Date(), revision: { increment: 1 } } });
    await expect(service.release({ slug, releaseId: release.id })).rejects.toMatchObject({
      response: { code: 'grant-denied' },
    });
    expect(runner.calls).toBe(0);
    expect((await releasesRepo.findById(release.id))?.stage).toBe('PREPARED');
  });

  it('发布阶段流转推进：PREPARED -> COMMITTING -> PUSHED -> VERIFYING，且退出码0不等于PUBLISHED', async () => {
    const slug = 'c14-stage-post';
    const { release } = await createFixtureRelease(slug);
    expect(release.stage).toBe('PREPARED');

    // 触发发布（异步执行）
    const dispatch = await service.release({ slug, releaseId: release.id });
    expect(dispatch.status).toBe('RUNNING');

    // 等待进入 COMMITTING 阶段并开始调用 runner
    await vi.waitFor(() => {
      expect(runner.calls).toBeGreaterThanOrEqual(1);
    }, { timeout: 3000 });

    // 模拟子进程退出码为 0
    runner.finish({ exitCode: 0, stdout: '{"tail":["发布成功"]}', stderr: '', timedOut: false, exitProof: 'exited' });

    // 等待推进到 PUSHED 并转入 VERIFYING
    await vi.waitFor(async () => {
      const current = await releasesRepo.findById(release.id);
      expect(current?.stage).toBe('VERIFYING');
      expect(current?.gitCommit).toBe(fakeGitStatus.headCommit);
      // 核心断言：退出码 0 绝不等于 PUBLISHED！
      expect(current?.stage).not.toBe('PUBLISHED');
    }, { timeout: 3000 });
  });

  it('重复请求复用已在途发布 (幂等)，不启动重复子进程', async () => {
    const slug = 'c14-stage-post';
    const { release } = await createFixtureRelease(slug);

    // 第一次触发
    const run1 = await service.release({ slug, releaseId: release.id });
    expect(run1.status).toBe('RUNNING');

    // 第二次并发触发同一 slug
    const run2 = await service.release({ slug, releaseId: release.id });
    expect(run2.runId).toBe(run1.runId);
    expect(run2.status).toBe('RUNNING');

    // 等待 runner 被异步调度调用
    await vi.waitFor(() => {
      expect(runner.calls).toBe(1);
    }, { timeout: 3000 });

    // 收尾并等待执行结束
    runner.finish({ exitCode: 0, stdout: '{}', stderr: '', timedOut: false, exitProof: 'exited' });
    await vi.waitFor(async () => {
      const current = await releasesRepo.findById(release.id);
      expect(current?.stage).toBe('VERIFYING');
    }, { timeout: 3000 });
  });

  it('脚本仍运行时核对不能把脏正本误判成提交中断', async () => {
    const slug = 'c14-stage-post';
    const { release } = await createFixtureRelease(slug);
    await service.release({ slug, releaseId: release.id });
    await vi.waitFor(() => expect(runner.calls).toBe(1));
    const result = await service.reconcile(release.id);
    expect(result.resolved).toBe(false);
    expect(result.currentStage).toBe('COMMITTING');
    runner.finish({ exitCode: 0, timedOut: false, exitProof: 'exited', stdout: '{}', stderr: '' });
    await vi.waitFor(async () => expect((await releasesRepo.findById(release.id))?.stage).toBe('VERIFYING'));
  });

  it('脚本启动后的非零退出保留 UNKNOWN，避免把可能已推送的内容记为失败', async () => {
    const slug = 'c14-stage-post';
    const { release } = await createFixtureRelease(slug);

    const dispatch = await service.release({ slug, releaseId: release.id });
    expect(dispatch.status).toBe('RUNNING');

    await vi.waitFor(() => {
      expect(runner.calls).toBeGreaterThanOrEqual(1);
    }, { timeout: 3000 });

    // 模拟子进程非零退出失败
    runner.finish({ exitCode: 1, stdout: '', stderr: 'git push rejected', timedOut: false, exitProof: 'exited' });

    await vi.waitFor(async () => {
      const current = await releasesRepo.findById(release.id);
      expect(current?.stage).toBe('UNKNOWN');
      expect(current?.errorCode).toBe('release-outcome-unknown');
      // 历史记录保持完整
      expect(current?.id).toBe(release.id);
      expect(current?.sourceHash).toBe(release.sourceHash);
    }, { timeout: 3000 });
  });

  it('进程树退出无法证明时保留发布锁，防止下一次发布混入', async () => {
    const slug = 'c14-stage-post';
    const { release } = await createFixtureRelease(slug);
    await service.release({ slug, releaseId: release.id });
    await vi.waitFor(() => expect(runner.calls).toBe(1));
    runner.finish({ exitCode: 0, timedOut: false, stdout: '', stderr: '', exitProof: 'unproven' });
    await vi.waitFor(async () => expect((await releasesRepo.findById(release.id))?.stage).toBe('UNKNOWN'));
    expect(await fs.stat(lockFile)).toBeDefined();
  });
});
