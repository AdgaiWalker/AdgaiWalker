import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { PublicationService } from './publication.service';
import { ContentReleaseService } from '../content-release/content-release.service';
import { WORK_REPOSITORY, type WorkRepositoryPort, type WorkRecord } from '../ports/work.repository';
import { STAGE_ARTIFACT_REPOSITORY, type StageArtifactRepositoryPort } from '../ports/stage-artifact.repository';
import { PUBLICATION_REPOSITORY, type PublicationRepositoryPort } from '../ports/publication.repository';
import { GIT_STATUS, type GitStatusPort, type WorkspaceGitStatus } from '../ports/git-status.repository';
import { CONTENT_RELEASE_RUNNER, type ContentReleaseRunnerPort, type ReleaseProcessResult } from '../ports/content-release-runner.port';
import { CONTENT_RELEASE_REPOSITORY, type ContentReleaseRepositoryPort } from '../ports/content-release.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

const token = 'c21-work-token';
let app: INestApplication;
let contentDir: string;
let lockFile: string;
let moduleRef: TestingModule;
let pubService: PublicationService;
let releaseService: ContentReleaseService;
let worksRepo: WorkRepositoryPort;
let pubRepo: PublicationRepositoryPort;

class MockRunner implements ContentReleaseRunnerPort {
  calls = 0;
  async runRelease(): Promise<ReleaseProcessResult> {
    this.calls += 1;
    return { exitCode: 0, timedOut: false, exitProof: 'exited', stdout: 'SUCCESS', stderr: '' };
  }
}

const runner = new MockRunner();

let gitWorkspaceStatus: WorkspaceGitStatus = {
  available: true,
  headCommit: 'commit-c21-head-999',
  files: [],
  dirtyFiles: [],
};

const mockGitPort: GitStatusPort = {
  async snapshot() {
    return { available: true, dirtyFiles: gitWorkspaceStatus.dirtyFiles, headCommit: gitWorkspaceStatus.headCommit };
  },
  async workspaceSnapshot() {
    return { ...gitWorkspaceStatus };
  },
};

describe('C21 将旧工作站发布接入同一出口（Kernel 集成测试）', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c21-content-'));
    const runsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c21-runs-'));
    const lockDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c21-lock-'));
    lockFile = path.join(lockDir, 'content-publish.lock');

    process.env.WALKER_ADMIN_TOKEN = token;
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.WALKER_RUNS_DIR = runsDir;
    process.env.WALKER_CONTENT_LOCK_PATH = lockFile;

    moduleRef = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
      .overrideProvider(GIT_STATUS).useValue(mockGitPort)
      .overrideProvider(CONTENT_RELEASE_RUNNER).useValue(runner)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');

    pubService = app.get(PublicationService);
    releaseService = app.get(ContentReleaseService);
    worksRepo = app.get(WORK_REPOSITORY);
    pubRepo = app.get(PUBLICATION_REPOSITORY);
  });

  afterAll(async () => {
    const db = app?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.publication.deleteMany({ where: { submissionId: { startsWith: 'c21-' } } });
      await db.submission.deleteMany({ where: { id: { startsWith: 'c21-' } } });
      await db.execution.deleteMany({ where: { id: { startsWith: 'execution-c21-' } } });
      await db.seedClueLink.deleteMany({ where: { id: { startsWith: 'link-c21-' } } });
      await db.seed.deleteMany({ where: { id: { startsWith: 'seed-c21-' } } });
      await db.clue.deleteMany({ where: { id: { startsWith: 'clue-c21-' } } });
      await db.auditRecord.deleteMany({ where: { targetId: { startsWith: 'c21-' } } });
      await db.contentRelease.deleteMany({ where: { targetSlug: { startsWith: 'c21-' } } });
      await db.contentChange.deleteMany({ where: { targetSlug: { startsWith: 'c21-' } } });
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
    // 等待上一轮异步执行完全释放锁
    await new Promise((r) => setTimeout(r, 50));
    await fs.rm(lockFile, { force: true });
    gitWorkspaceStatus = {
      available: true,
      headCommit: 'commit-c21-head-999',
      files: [],
      dirtyFiles: [],
    };
    runner.calls = 0;
  });

  async function createApprovedWorkFixture(workId: string, slug: string) {
    const stagesRepo = app.get<StageArtifactRepositoryPort>(STAGE_ARTIFACT_REPOSITORY);

    await worksRepo.createFromDraft({
      id: workId,
      idempotencyKey: `idem-${workId}`,
      title: 'C21 测试作品标题',
      sourceProblem: '测试问题',
      whyNow: '现在测试',
      contentBrief: { audience: '访客', scenario: '场景', problem: '问题', keyQuestion: '关键问题', intendedAction: '期望动作' },
      coreViewpoint: '核心观点',
      protectedClaims: [],
      manifestPath: `manifest-${workId}`,
    });

    const written = await stagesRepo.write(workId, {
      recipeVersion: 1,
      stage: 'REVIEW_READY',
      output: {
        title: 'C21 测试作品标题',
        markdown: '# 正文内容\n\n工作站生成的段落',
        summary: '测试摘要',
        form: 'article',
        domain: 'product',
        intent: 'share',
        valueMode: 'utility',
      },
    });

    await worksRepo.setStatus!(workId, 'APPROVED', written.hash);

    return { workId, artifactHash: written.hash };
  }

  it('保留候选 hash 审批和作品状态：不匹配的 hash 拒绝发布', async () => {
    const workId = `c21-work-${randomUUID().slice(0, 8)}`;
    const { artifactHash } = await createApprovedWorkFixture(workId, 'c21-post-1');

    await expect(pubService.publishWebsite(workId, 'wrong-hash')).rejects.toThrow('artifact-hash-mismatch');
  });

  it('范围外脏文件阻断发布：工作区存在其他代码/文章未提交时拒绝发布', async () => {
    const workId = `c21-work-${randomUUID().slice(0, 8)}`;
    const { artifactHash } = await createApprovedWorkFixture(workId, 'c21-post-2');

    // 注入范围外脏代码
    gitWorkspaceStatus = {
      available: true,
      headCommit: 'commit-c21-head-999',
      files: [{ path: 'apps/api/src/index.ts', staged: false, dirty: true, statusCode: ' M' }],
      dirtyFiles: ['apps/api/src/index.ts'],
    };

    await expect(pubService.publishWebsite(workId, artifactHash)).rejects.toThrow(/发布范围冲突/);
  });

  it('发布动作引用 ContentRelease：发布成功后 Publication 状态为 PREPARED（不等于 PUBLISHED）', async () => {
    const workId = `c21-work-${randomUUID().slice(0, 8)}`;
    const { artifactHash } = await createApprovedWorkFixture(workId, 'c21-post-3');

    const pub = await pubService.publishWebsite(workId, artifactHash);
    expect(pub.status).toBe('PREPARED');
    expect(pub.publishedAt).toBeNull();
    expect(pub.url).toContain('/posts/');

    // 验证底层 ContentRelease 事实记录已由统一出口创建并进入流水
    const slugMatch = pub.url!.match(/\/posts\/([^/?#]+)/);
    const slug = decodeURIComponent(slugMatch![1]);
    const latestRel = await releaseService.getLatestRelease(slug);
    expect(latestRel).toBeDefined();
    expect(latestRel?.target.slug).toBe(slug);
    expect(latestRel?.stage).toBe('PREPARED');
  });

  it('verifyWebsite 接入同一 ContentRelease 核验出口，不另起核验链', async () => {
    const workId = `c21-work-${randomUUID().slice(0, 8)}`;
    const { artifactHash } = await createApprovedWorkFixture(workId, 'c21-post-4');

    const pub = await pubService.publishWebsite(workId, artifactHash);
    const slugMatch = pub.url!.match(/\/posts\/([^/?#]+)/);
    const slug = decodeURIComponent(slugMatch![1]);

    const latestRel = await releaseService.getLatestRelease(slug);
    expect(latestRel).toBeDefined();

    // 模拟统一发布在流水中完成 VERIFYING 并成功确证目标 hash
    const repo = app.get<ContentReleaseRepositoryPort>(CONTENT_RELEASE_REPOSITORY);
    await repo.updateStage({ id: latestRel!.id, stage: 'COMMITTING' });
    await repo.updateStage({ id: latestRel!.id, stage: 'PUSHED' });
    await repo.updateStage({ id: latestRel!.id, stage: 'VERIFYING' });
    await repo.updateStage({
      id: latestRel!.id,
      stage: 'PUBLISHED',
      verifiedHash: latestRel!.sourceHash,
      verifiedAt: new Date().toISOString(),
    });

    const verifiedPub = await pubService.verifyWebsite(workId);
    expect(verifiedPub.status).toBe('PUBLISHED');
    expect(verifiedPub.publishedAt).toBeDefined();

    const work = await worksRepo.findById(workId);
    expect(work?.status).toBe('PARTIALLY_PUBLISHED');
  });
});