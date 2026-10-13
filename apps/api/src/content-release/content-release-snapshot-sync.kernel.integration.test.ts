import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  publicManifest,
  type PublicSnapshotSource,
} from '@walker/shared';
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
  PUBLIC_SNAPSHOT_REPOSITORY,
  type PublicSnapshotRepositoryPort,
} from '../ports/public-snapshot.repository';
import { GIT_STATUS, type GitStatusPort } from '../ports/git-status.repository';
import {
  WEBSITE_DEPLOYMENT_VERIFIER,
  type VerifyWebsiteDeploymentInput,
  type VerifyWebsiteDeploymentResult,
  type WebsiteDeploymentVerifierPort,
} from '../ports/website-deployment-verifier.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { contentApprovalHash } from '../adapters/content-approval.persistence';

const SITE = 'https://snapshot-sync-test.example';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

class FakeVerifier implements WebsiteDeploymentVerifierPort {
  result: VerifyWebsiteDeploymentResult = { ok: true };
  async verify(_url: string, _expected: VerifyWebsiteDeploymentInput): Promise<VerifyWebsiteDeploymentResult> {
    return this.result;
  }
}

const verifier = new FakeVerifier();

const cleanGit: GitStatusPort = {
  async snapshot() {
    return { available: true, dirtyFiles: [], headCommit: 'head-c17' };
  },
  async workspaceSnapshot() {
    return { available: true, headCommit: 'head-c17', files: [], dirtyFiles: [] };
  },
};

let moduleRef: TestingModule;
let service: ContentReleaseService;
let releasesRepo: ContentReleaseRepositoryPort;
let changesRepo: ContentChangeRepositoryPort;
let publicSnapshots: PublicSnapshotRepositoryPort;
let contentDir: string;
let snapshotDir: string;

const SLUG = 'c17-sync-post';

function createSourceDoc(slug: string, bodyText: string): PublicSnapshotSource {
  return {
    slug,
    title: '同步文章测试',
    updated: '2026-09-25',
    summary: '文章摘要测试',
    body: bodyText,
    type: 'knowledge',
    visibility: 'public',
    published: true,
    aiUsePolicy: { readable: true, citable: true },
  };
}

async function makeReleaseAtVerifying(targetSlug: string, sourceHash: string, baseHash: string): Promise<string> {
  const db = moduleRef.get<PrismaPort>(PRISMA).getClient()!;
  const grantId = `c17-grant-${randomUUID().slice(0, 8)}`;
  await db.authorizationGrant.create({
    data: {
      id: grantId,
      revision: 1,
      principalType: 'user',
      principalId: 'owner',
      origin: 'admin',
      actions: ['content:apply', 'content:publish'],
      resourceScope: { type: 'content', id: targetSlug },
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });

  const change = await changesRepo.createOnce({
    id: `c17-chg-${randomUUID().slice(0, 8)}`,
    target: { kind: 'content', slug: targetSlug },
    baseHash,
    candidateHash: sourceHash,
    candidateRef: 'cand-ref-c17',
    sourceRunId: 'run-source-c17',
    requestKey: `c17-chg-req-${randomUUID().slice(0, 8)}`,
  });

  await db.contentChange.update({
    where: { id: change.id },
    data: { state: 'APPLIED', appliedHash: sourceHash },
  });

  const binding = {
    action: 'publish-website' as const,
    target: { kind: 'content' as const, slug: targetSlug },
    baseHash,
    candidateHash: sourceHash,
    grantId,
    grantRevision: 1,
  };

  const release = await releasesRepo.createOnce({
    id: `c17-rel-${randomUUID().slice(0, 8)}`,
    changeId: change.id,
    target: { kind: 'content', slug: targetSlug },
    baseHash,
    sourceHash,
    requestKey: `c17-rel-req-${randomUUID().slice(0, 8)}`,
    publishApproval: {
      id: `c17-appr-${randomUUID().slice(0, 8)}`,
      binding,
      bindingHash: contentApprovalHash(binding),
      approvedBy: 'owner',
      approvedAt: new Date().toISOString(),
    },
  });

  await releasesRepo.updateStage({ id: release.id, stage: 'COMMITTING' });
  await releasesRepo.updateStage({ id: release.id, stage: 'PUSHED', gitCommit: 'head-c17' });
  await releasesRepo.updateStage({ id: release.id, stage: 'VERIFYING' });
  return release.id;
}

describe('C17 发布后问答快照切换（Kernel 集成测试）', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c17-content-'));
    snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c17-snapshots-'));
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.WALKER_PUBLIC_SNAPSHOT_DIR = snapshotDir;
    process.env.PUBLIC_SITE_URL = SITE;

    await fs.writeFile(
      path.join(contentDir, `${SLUG}.md`),
      '---\ntitle: 本地工作区最新草稿\n---\n这里是未发布的本地私有草稿正文。\n',
      'utf8',
    );

    moduleRef = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
      .overrideProvider(GIT_STATUS).useValue(cleanGit)
      .overrideProvider(WEBSITE_DEPLOYMENT_VERIFIER).useValue(verifier)
      .compile();
    await moduleRef.init();

    service = moduleRef.get(ContentReleaseService);
    releasesRepo = moduleRef.get(CONTENT_RELEASE_REPOSITORY);
    changesRepo = moduleRef.get(CONTENT_CHANGE_REPOSITORY);
    publicSnapshots = moduleRef.get(PUBLIC_SNAPSHOT_REPOSITORY);
  });

  afterAll(async () => {
    const db = moduleRef?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.contentRelease.deleteMany({ where: { targetSlug: { startsWith: 'c17-' } } });
      await db.contentChange.deleteMany({ where: { targetSlug: { startsWith: 'c17-' } } });
      await db.authorizationGrant.deleteMany({ where: { id: { startsWith: 'c17-' } } });
    }
    await moduleRef?.close();
    await fs.rm(contentDir, { recursive: true, force: true });
    await fs.rm(snapshotDir, { recursive: true, force: true });
    delete process.env.CONTENT_LOG_DIR;
    delete process.env.WALKER_PUBLIC_SNAPSHOT_DIR;
    delete process.env.PUBLIC_SITE_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('较新的失败发布单不遮蔽最近一次已确证的网页版本', async () => {
    const slug = 'c17-version-post';
    const publishedHash = '1'.repeat(64);
    const publishedId = await makeReleaseAtVerifying(slug, publishedHash, '0'.repeat(64));
    await releasesRepo.updateStage({ id: publishedId, stage: 'PUBLISHED', verifiedHash: publishedHash, verifiedAt: new Date().toISOString() });
    const failedId = await makeReleaseAtVerifying(slug, '2'.repeat(64), publishedHash);
    await releasesRepo.updateStage({ id: failedId, stage: 'FAILED', errorCode: 'test-failure' });

    expect((await service.getVersionSnapshot(slug)).publishedHash).toBe(publishedHash);
  });

  it('上线核验成功后自动导入线上 manifest 并切换问答快照指针（SYNCED）', async () => {
    const newDoc = createSourceDoc(SLUG, '已核验并在 Vercel 上线的正文内容 V2');
    const newManifest = publicManifest([newDoc], sha);
    const targetHash = newManifest.items[0]!.hash;
    const baseHash = 'a'.repeat(64);

    const releaseId = await makeReleaseAtVerifying(SLUG, targetHash, baseHash);

    // 网页核验成功
    verifier.result = { ok: true, verifiedHash: targetHash, htmlMatched: true, manifestMatched: true };

    // 线上 public-manifest.json 模拟
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('public-manifest.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => newManifest,
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    }));

    const outcome = await service.verify(releaseId);

    expect(outcome.verified).toBe(true);
    expect(outcome.stage).toBe('PUBLISHED');
    expect(outcome.assistantIndexState).toBe('SYNCED');
    expect(outcome.publishedSnapshotId).toBe(newManifest.collectionHash);
    expect(outcome.reason).toBeNull();

    // 验证数据库持久化
    const stored = await releasesRepo.findById(releaseId);
    expect(stored?.stage).toBe('PUBLISHED');
    expect(stored?.assistantIndexState).toBe('SYNCED');
    expect(stored?.publishedSnapshotId).toBe(newManifest.collectionHash);

    // 验证快照仓储已切换至新版本
    const active = await publicSnapshots.readActive();
    expect(active.collectionHash).toBe(newManifest.collectionHash);
    expect(active.items[0]?.hash).toBe(targetHash);
    expect(active.items[0]?.body).toBe('已核验并在 Vercel 上线的正文内容 V2');

    // 核心断言：快照来自线上产物，绝不包含本地草稿文字
    expect(active.items[0]?.body).not.toContain('这里是未发布的本地私有草稿正文');

    // 验证三者独立真相源投影
    const versions = await service.getVersionSnapshot(SLUG);
    expect(versions.publishedHash).toBe(targetHash);
    expect(versions.indexedHash).toBe(targetHash);
  });

  it('网页已上线但问答快照同步失败时：保留 PUBLISHED 与 FAILED，且旧快照可用', async () => {
    // 1. 预先存在一个旧版本的活跃快照
    const oldDoc = createSourceDoc(SLUG, '历史版本已核验快照 V1');
    const oldManifest = publicManifest([oldDoc], sha);
    await publicSnapshots.publish(oldManifest);

    const oldActive = await publicSnapshots.readActive();
    expect(oldActive.collectionHash).toBe(oldManifest.collectionHash);

    // 2. 建立新发布的 release
    const nextTargetHash = 'c'.repeat(64);
    const releaseId = await makeReleaseAtVerifying(SLUG, nextTargetHash, oldManifest.items[0]!.hash);

    // 网页核验成功
    verifier.result = { ok: true, verifiedHash: nextTargetHash, htmlMatched: true, manifestMatched: true };

    // 模拟线上 public-manifest.json 拉取失败（HTTP 500 异常）
    vi.stubGlobal('fetch', vi.fn(async () => {
      return {
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as unknown as Response;
    }));

    const outcome = await service.verify(releaseId);

    // 网页已确证上线，但问答同步失败
    expect(outcome.verified).toBe(true);
    expect(outcome.stage).toBe('PUBLISHED');
    expect(outcome.assistantIndexState).toBe('FAILED');
    expect(outcome.reason).toBe('assistant-index-sync-failed');

    // 数据库持久化状态保持分离
    const stored = await releasesRepo.findById(releaseId);
    expect(stored?.stage).toBe('PUBLISHED');
    expect(stored?.assistantIndexState).toBe('FAILED');

    // 核心红线验收：旧快照依然可用！没有被破坏或置空
    const currentActive = await publicSnapshots.readActive();
    expect(currentActive.collectionHash).toBe(oldManifest.collectionHash);
    expect(currentActive.items[0]?.body).toBe('历史版本已核验快照 V1');

    // 版本投影展现不同真相：网页已上线，但问答索引仍停留在旧版本
    const versions = await service.getVersionSnapshot(SLUG);
    expect(versions.publishedHash).toBe(nextTargetHash);
    expect(versions.indexedHash).toBe(oldManifest.items[0]!.hash);
    expect(versions.publishedHash).not.toBe(versions.indexedHash);
  });

  it('线上 manifest 缺少目标版本或 hash 不匹配时拒绝切换快照，如实记 FAILED', async () => {
    const wrongDoc = createSourceDoc(SLUG, '不同的正文内容');
    const wrongManifest = publicManifest([wrongDoc], sha);
    const expectedHash = 'd'.repeat(64);

    const releaseId = await makeReleaseAtVerifying(SLUG, expectedHash, 'a'.repeat(64));
    verifier.result = { ok: true, verifiedHash: expectedHash, htmlMatched: true };

    // 线上 manifest 里的 hash 与当前发布的 expectedHash 不一致
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => wrongManifest,
    } as unknown as Response)));

    const outcome = await service.verify(releaseId);
    expect(outcome.stage).toBe('PUBLISHED');
    expect(outcome.assistantIndexState).toBe('FAILED');

    const stored = await releasesRepo.findById(releaseId);
    expect(stored?.assistantIndexState).toBe('FAILED');
  });
});
