import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { ContentReleaseService } from './content-release.service';
import {
  CONTENT_RELEASE_REPOSITORY,
  type ContentReleaseRepositoryPort,
} from '../ports/content-release.repository';
import {
  CONTENT_CHANGE_REPOSITORY,
  type ContentChangeRepositoryPort,
} from '../ports/content-change.repository';
import {
  GIT_STATUS,
  type GitStatusPort,
  type WorkspaceGitStatus,
} from '../ports/git-status.repository';
import {
  WEBSITE_DEPLOYMENT_VERIFIER,
  type VerifyWebsiteDeploymentInput,
  type VerifyWebsiteDeploymentResult,
  type WebsiteDeploymentVerifierPort,
} from '../ports/website-deployment-verifier.port';
import {
  CONTENT_RELEASE_RUNNER,
  type ContentReleaseRunnerPort,
  type ReleaseProcessResult,
} from '../ports/content-release-runner.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { contentApprovalHash } from '../adapters/content-approval.persistence';

const SITE = 'https://reconcile-test.example';

class FakeVerifier implements WebsiteDeploymentVerifierPort {
  result: VerifyWebsiteDeploymentResult = { ok: false, reason: 'remote-http-404' };
  async verify(_url: string, _expected: VerifyWebsiteDeploymentInput): Promise<VerifyWebsiteDeploymentResult> {
    return this.result;
  }
}

const verifier = new FakeVerifier();

class SpyReleaseRunner implements ContentReleaseRunnerPort {
  calls = 0;
  async runRelease(): Promise<ReleaseProcessResult> {
    this.calls += 1;
    return { exitCode: 0, stdout: '{}', stderr: '', timedOut: false, exitProof: 'exited' };
  }
}

const runner = new SpyReleaseRunner();

let mockWorkspaceStatus: WorkspaceGitStatus = {
  available: true,
  headCommit: 'head-c18',
  files: [],
  dirtyFiles: [],
};

let mockHasCommitResult = false;

const mockGit: GitStatusPort = {
  async snapshot() {
    return {
      available: mockWorkspaceStatus.available,
      dirtyFiles: mockWorkspaceStatus.dirtyFiles,
      headCommit: mockWorkspaceStatus.headCommit,
    };
  },
  async workspaceSnapshot() {
    return mockWorkspaceStatus;
  },
  async hasCommit(_commit: string) {
    return mockHasCommitResult;
  },
};

let moduleRef: TestingModule;
let service: ContentReleaseService;
let releasesRepo: ContentReleaseRepositoryPort;
let changesRepo: ContentChangeRepositoryPort;
let contentDir: string;

const SLUG = 'c18-reconcile-post';
const SOURCE_HASH = 'c'.repeat(64);
const BASE_HASH = 'b'.repeat(64);

async function makeFixtureRelease(stage: 'COMMITTING' | 'PUSHED' | 'VERIFYING' | 'UNKNOWN', gitCommit?: string | null): Promise<string> {
  const db = moduleRef.get<PrismaPort>(PRISMA).getClient()!;
  const grantId = `c18-grant-${randomUUID().slice(0, 8)}`;
  await db.authorizationGrant.create({
    data: {
      id: grantId,
      revision: 1,
      principalType: 'user',
      principalId: 'owner',
      origin: 'admin',
      actions: ['content:apply', 'content:publish'],
      resourceScope: { type: 'content', id: SLUG },
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });

  const change = await changesRepo.createOnce({
    id: `c18-chg-${randomUUID().slice(0, 8)}`,
    target: { kind: 'content', slug: SLUG },
    baseHash: BASE_HASH,
    candidateHash: SOURCE_HASH,
    candidateRef: 'cand-ref-c18',
    sourceRunId: 'run-source-c18',
    requestKey: `c18-chg-req-${randomUUID().slice(0, 8)}`,
  });

  await db.contentChange.update({
    where: { id: change.id },
    data: { state: 'APPLIED', appliedHash: SOURCE_HASH },
  });

  const binding = {
    action: 'publish-website' as const,
    target: { kind: 'content' as const, slug: SLUG },
    baseHash: BASE_HASH,
    candidateHash: SOURCE_HASH,
    grantId,
    grantRevision: 1,
  };

  const release = await releasesRepo.createOnce({
    id: `c18-rel-${randomUUID().slice(0, 8)}`,
    changeId: change.id,
    target: { kind: 'content', slug: SLUG },
    baseHash: BASE_HASH,
    sourceHash: SOURCE_HASH,
    requestKey: `c18-rel-req-${randomUUID().slice(0, 8)}`,
    publishApproval: {
      id: `c18-appr-${randomUUID().slice(0, 8)}`,
      binding,
      bindingHash: contentApprovalHash(binding),
      approvedBy: 'owner',
      approvedAt: new Date().toISOString(),
    },
  });

  // 直接置入目标阶段进行断点核对测试
  await db.contentRelease.update({
    where: { id: release.id },
    data: {
      stage,
      gitCommit: gitCommit ?? null,
    },
  });

  return release.id;
}

describe('C18 结果不明的发布核对（Kernel 集成测试）', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c18-content-'));
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.PUBLIC_SITE_URL = SITE;

    await fs.writeFile(path.join(contentDir, `${SLUG}.md`), '---\ntitle: x\n---\nbody\n', 'utf8');

    moduleRef = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
      .overrideProvider(GIT_STATUS).useValue(mockGit)
      .overrideProvider(WEBSITE_DEPLOYMENT_VERIFIER).useValue(verifier)
      .overrideProvider(CONTENT_RELEASE_RUNNER).useValue(runner)
      .compile();
    await moduleRef.init();

    service = moduleRef.get(ContentReleaseService);
    releasesRepo = moduleRef.get(CONTENT_RELEASE_REPOSITORY);
    changesRepo = moduleRef.get(CONTENT_CHANGE_REPOSITORY);
  });

  afterAll(async () => {
    const db = moduleRef?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.contentRelease.deleteMany({ where: { targetSlug: { startsWith: 'c18-' } } });
      await db.contentChange.deleteMany({ where: { targetSlug: { startsWith: 'c18-' } } });
      await db.authorizationGrant.deleteMany({ where: { id: { startsWith: 'c18-' } } });
    }
    await moduleRef?.close();
    await fs.rm(contentDir, { recursive: true, force: true });
    delete process.env.CONTENT_LOG_DIR;
    delete process.env.PUBLIC_SITE_URL;
  });

  afterEach(() => {
    runner.calls = 0;
    mockHasCommitResult = false;
    verifier.result = { ok: false, reason: 'remote-http-404' };
    mockWorkspaceStatus = { available: true, headCommit: 'head-c18', files: [], dirtyFiles: [] };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('服务重启后状态为 UNKNOWN，若线上已是目标版本，reconcile 转为 PUBLISHED 且不重复提交', async () => {
    const releaseId = await makeFixtureRelease('UNKNOWN', 'commit-pushed-c18');

    // 线上 verifier 证明目标 hash 已经上线生效
    verifier.result = { ok: true, verifiedHash: SOURCE_HASH, htmlMatched: true };

    const result = await service.reconcile(releaseId);

    expect(result.resolved).toBe(true);
    expect(result.previousStage).toBe('UNKNOWN');
    expect(result.currentStage).toBe('PUBLISHED');
    expect(result.verifiedHash).toBe(SOURCE_HASH);
    expect(result.nextAction).toBe('none');

    // 严防二次提交：脚本未被调用
    expect(runner.calls).toBe(0);

    // 数据库事实已更新为 PUBLISHED
    const stored = await releasesRepo.findById(releaseId);
    expect(stored?.stage).toBe('PUBLISHED');
    expect(stored?.verifiedHash).toBe(SOURCE_HASH);
  });

  it('UNKNOWN 只有本地 commit 而无远端证据时保留 UNKNOWN，严禁重复提交', async () => {
    const releaseId = await makeFixtureRelease('UNKNOWN', 'commit-pushed-c18');

    // 线上尚未生效（404 或旧版本）
    verifier.result = { ok: false, reason: 'remote-http-404' };
    // Git 历史已确证该 commit 存在
    mockHasCommitResult = true;

    const result = await service.reconcile(releaseId);

    expect(result.resolved).toBe(false);
    expect(result.previousStage).toBe('UNKNOWN');
    expect(result.currentStage).toBe('UNKNOWN');
    expect(result.nextAction).toBe('check-git-remote');

    // 严防二次提交
    expect(runner.calls).toBe(0);

    const stored = await releasesRepo.findById(releaseId);
    expect(stored?.stage).toBe('UNKNOWN');
  });

  it('COMMITTING 阶段异常中断且工作区仍未提交：reconcile 将中断置为 FAILED', async () => {
    const releaseId = await makeFixtureRelease('COMMITTING', null);

    // 线上未生效
    verifier.result = { ok: false, reason: 'remote-http-404' };
    // 工作区中文件仍处于未提交脏状态
    mockWorkspaceStatus = {
      available: true,
      headCommit: 'head-c18',
      files: [],
      dirtyFiles: [`content/log/${SLUG}.md`],
    };

    const result = await service.reconcile(releaseId);

    expect(result.resolved).toBe(true);
    expect(result.previousStage).toBe('COMMITTING');
    expect(result.currentStage).toBe('FAILED');
    expect(result.nextAction).toBe('none');
    expect(result.details).toContain('可重新发起发布');

    const stored = await releasesRepo.findById(releaseId);
    expect(stored?.stage).toBe('FAILED');
    expect(stored?.errorCode).toBe('commit-interrupted');
  });

  it('无法确证事实时保留 UNKNOWN，并给出明确 nextAction（check-git-remote）', async () => {
    const releaseId = await makeFixtureRelease('COMMITTING', null);

    // 线上核验不可达
    verifier.result = { ok: false, reason: 'remote-verification-failed' };
    // Git 状态也不可用
    mockWorkspaceStatus = { available: false, headCommit: null, files: [], dirtyFiles: [] };

    const result = await service.reconcile(releaseId);

    expect(result.resolved).toBe(false);
    expect(result.currentStage).toBe('UNKNOWN');
    expect(result.nextAction).toBe('check-git-remote');
    expect(result.details).toContain('保持 UNKNOWN 状态');

    const stored = await releasesRepo.findById(releaseId);
    expect(stored?.stage).toBe('UNKNOWN');
  });
});
