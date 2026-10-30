/**
 * 文章版本历史端到端（公开演进史）：
 * 发布确证 PUBLISHED 那一刻固化一条不可变版本；后台可查列表/详情/diff；
 * 相同内容重复确证不建版本；blob 无删除路径。
 */
import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { ContentReleaseService } from './content-release.service';
import { ContentAdminService } from '../content-admin/content-admin.service';
import {
  CONTENT_RELEASE_REPOSITORY,
  type ContentReleaseRepositoryPort,
} from '../ports/content-release.repository';
import { CONTENT_CHANGE_REPOSITORY, type ContentChangeRepositoryPort } from '../ports/content-change.repository';
import { GIT_STATUS, type GitStatusPort } from '../ports/git-status.repository';
import {
  WEBSITE_DEPLOYMENT_VERIFIER,
  type VerifyWebsiteDeploymentResult,
  type WebsiteDeploymentVerifierPort,
} from '../ports/website-deployment-verifier.port';
import { ARTICLE_VERSION_STORE, type ArticleVersionStorePort } from '../ports/article-version-store.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { contentApprovalHash } from '../adapters/content-approval.persistence';

const SITE = 'https://versions-test.example';
const SLUG = 'avh-post';
const BASE_HASH = 'a'.repeat(64);
const HASH_V1 = 'b'.repeat(64);
const HASH_V2 = 'c'.repeat(64);

class FakeVerifier implements WebsiteDeploymentVerifierPort {
  result: VerifyWebsiteDeploymentResult = { ok: true };
  async verify(): Promise<VerifyWebsiteDeploymentResult> {
    return this.result;
  }
}
const verifier = new FakeVerifier();

const cleanGit: GitStatusPort = {
  async snapshot() {
    return { available: true, dirtyFiles: [], headCommit: 'head-avh' };
  },
  async workspaceSnapshot() {
    return { available: true, headCommit: 'head-avh', files: [], dirtyFiles: [] };
  },
};

let moduleRef: TestingModule;
let service: ContentReleaseService;
let adminService: ContentAdminService;
let versionStore: ArticleVersionStorePort;
let releasesRepo: ContentReleaseRepositoryPort;
let changesRepo: ContentChangeRepositoryPort;
let contentDir: string;
let versionsDir: string;

async function makeReleaseAtVerifying(sourceHash: string, note: string, appliedFileHash?: string): Promise<string> {
  const db = moduleRef.get<PrismaPort>(PRISMA).getClient()!;
  const grantId = `avh-grant-${randomUUID().slice(0, 8)}`;
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
  const appliedHash = appliedFileHash ?? sourceHash;
  const change = await changesRepo.createOnce({
    id: `avh-chg-${randomUUID().slice(0, 8)}`,
    target: { kind: 'content', slug: SLUG },
    baseHash: BASE_HASH,
    candidateHash: appliedHash,
    candidateRef: 'cand-ref-avh',
    sourceRunId: 'run-source-avh',
    requestKey: `avh-chg-req-${randomUUID().slice(0, 8)}`,
  });
  // 真实链路：批准快照 → beginApply → finishApply（C09 语义；直接 update 会缺批准快照被仓储校验拒）
  const applyBinding = {
    action: 'apply-candidate' as const,
    target: { kind: 'content' as const, slug: SLUG },
    baseHash: BASE_HASH,
    candidateHash: appliedHash,
    grantId,
    grantRevision: 1,
  };
  await changesRepo.recordApproval({
    id: change.id,
    approval: {
      id: `avh-apply-appr-${randomUUID().slice(0, 8)}`,
      binding: applyBinding,
      bindingHash: contentApprovalHash(applyBinding),
      approvedBy: 'owner',
      approvedAt: new Date().toISOString(),
    },
  });
  const applyReqId = `avh-apply-req-${randomUUID().slice(0, 8)}`;
  await changesRepo.beginApply({ id: change.id, actor: 'owner', requestId: applyReqId });
  await changesRepo.finishApply({ id: change.id, actor: 'owner', requestId: applyReqId, outcome: 'APPLIED', observedHash: appliedHash });
  const binding = {
    action: 'publish-website' as const,
    target: { kind: 'content' as const, slug: SLUG },
    baseHash: BASE_HASH,
    candidateHash: sourceHash,
    grantId,
    grantRevision: 1,
  };
  const release = await releasesRepo.createOnce({
    id: `avh-rel-${randomUUID().slice(0, 8)}`,
    changeId: change.id,
    target: { kind: 'content', slug: SLUG },
    baseHash: BASE_HASH,
    sourceHash,
    versionNote: note,
    requestKey: `avh-rel-req-${randomUUID().slice(0, 8)}`,
    publishApproval: {
      id: `avh-appr-${randomUUID().slice(0, 8)}`,
      binding,
      bindingHash: contentApprovalHash(binding),
      approvedBy: 'owner',
      approvedAt: new Date().toISOString(),
    },
  });
  await releasesRepo.updateStage({ id: release.id, stage: 'COMMITTING' });
  await releasesRepo.updateStage({ id: release.id, stage: 'PUSHED', gitCommit: 'head-avh' });
  await releasesRepo.updateStage({ id: release.id, stage: 'VERIFYING' });
  return release.id;
}

describe('文章版本历史（公开演进史）端到端', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-avh-content-'));
    versionsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-avh-versions-'));
    const runsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-avh-runs-'));
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.ARTICLE_VERSIONS_DIR = versionsDir;
    process.env.WALKER_RUNS_DIR = runsDir;
    process.env.PUBLIC_SITE_URL = SITE;

    moduleRef = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
      .overrideProvider(GIT_STATUS).useValue(cleanGit)
      .overrideProvider(WEBSITE_DEPLOYMENT_VERIFIER).useValue(verifier)
      .compile();
    await moduleRef.init();

    service = moduleRef.get(ContentReleaseService);
    adminService = moduleRef.get(ContentAdminService);
    versionStore = moduleRef.get(ARTICLE_VERSION_STORE);
    releasesRepo = moduleRef.get(CONTENT_RELEASE_REPOSITORY);
    changesRepo = moduleRef.get(CONTENT_CHANGE_REPOSITORY);
  });

  afterAll(async () => {
    const db = moduleRef?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.contentRelease.deleteMany({ where: { targetSlug: SLUG } });
      await db.contentChange.deleteMany({ where: { targetSlug: SLUG } });
      await db.authorizationGrant.deleteMany({ where: { id: { startsWith: 'avh-' } } });
    }
    await moduleRef?.close();
    await fs.rm(contentDir, { recursive: true, force: true });
    await fs.rm(versionsDir, { recursive: true, force: true });
    delete process.env.CONTENT_LOG_DIR;
    delete process.env.ARTICLE_VERSIONS_DIR;
    delete process.env.WALKER_RUNS_DIR;
    delete process.env.PUBLIC_SITE_URL;
  });

  it('发布确证 → 版本落库 → 后台列表/详情/diff 闭环；同内容不建版本', async () => {
    // v1：正文第一版（appliedHash = 真实文件 sha256，与生产 save 语义一致）
    const bodyV1 = '---\ntitle: 版本史\n---\n第一版正文\n';
    await fs.writeFile(path.join(contentDir, `${SLUG}.md`), bodyV1, 'utf8');
    const fileHashV1 = createHash('sha256').update(bodyV1, 'utf8').digest('hex');
    verifier.result = { ok: true, verifiedHash: HASH_V1, htmlMatched: true, manifestMatched: true };
    const rel1 = await makeReleaseAtVerifying(HASH_V1, '首版发布', fileHashV1);
    const out1 = await service.verify(rel1);
    expect(out1.stage).toBe('PUBLISHED');

    const index1 = await versionStore.readIndex(SLUG);
    expect(index1?.versions).toHaveLength(1);
    expect(index1?.versions[0]?.version).toBe(1);
    expect(index1?.versions[0]?.note).toBe('首版发布');
    expect(index1?.versions[0]?.releaseId).toBe(rel1);

    // v2：正文变了
    const bodyV2 = '---\ntitle: 版本史\n---\n第二版正文，改了\n';
    await fs.writeFile(path.join(contentDir, `${SLUG}.md`), bodyV2, 'utf8');
    const fileHashV2 = createHash('sha256').update(bodyV2, 'utf8').digest('hex');
    verifier.result = { ok: true, verifiedHash: HASH_V2, htmlMatched: true, manifestMatched: true };
    const rel2 = await makeReleaseAtVerifying(HASH_V2, '更新数据', fileHashV2);
    const out2 = await service.verify(rel2);
    expect(out2.stage).toBe('PUBLISHED');

    // 后台闭环：列表（不带正文）
    const history = await adminService.listVersions(SLUG);
    expect(history.versions.map((v) => v.version)).toEqual([2, 1]); // 倒序
    expect(history.versions[0]?.note).toBe('更新数据');

    // 详情（带正文）
    const detail1 = await adminService.getVersion(SLUG, 1);
    expect(detail1.body).toBe(bodyV1);
    const detail2 = await adminService.getVersion(SLUG, 2);
    expect(detail2.body).toBe(bodyV2);

    // diff 现算
    const diff = await adminService.diffVersions(SLUG, 1, 2);
    expect(diff.diff.hasChanges).toBe(true);
    expect(diff.diff.addedCount).toBeGreaterThan(0);

    // 同内容重复确证不建版本：verify 幂等（已 PUBLISHED 直接返回）
    const out2again = await service.verify(rel2);
    expect(out2again.stage).toBe('PUBLISHED');
    const indexAfter = await versionStore.readIndex(SLUG);
    expect(indexAfter?.versions).toHaveLength(2);

    // blob 无删除路径：v1 正文仍原样可读
    const v1Hash = indexAfter!.versions[0]!.contentHash;
    expect(await versionStore.readBody(v1Hash)).toBe(bodyV1);
  });

  it('正文漂移红线：批准后文件又被动过（appliedHash ≠ 当前文件）时，拒绝把草稿记成已发布版本', async () => {
    // 新 slug 隔离：v3 发布单按 HASH_V1 口径准备并确证线上，但此刻文件是「没上线的新草稿」
    const driftSlug = 'avh-drift-post';
    const bodyPublished = '---\ntitle: 漂移\n---\n被批准并上线的正文\n';
    const bodyDraft = '---\ntitle: 漂移\n---\n批准后又改的新草稿（未上线）\n';
    await fs.writeFile(path.join(contentDir, `${driftSlug}.md`), bodyDraft, 'utf8');

    const db = moduleRef.get<PrismaPort>(PRISMA).getClient()!;
    const grantId = `avh-grant-${randomUUID().slice(0, 8)}`;
    await db.authorizationGrant.create({
      data: {
        id: grantId, revision: 1, principalType: 'user', principalId: 'owner', origin: 'admin',
        actions: ['content:apply', 'content:publish'],
        resourceScope: { type: 'content', id: driftSlug },
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    // change.appliedHash = 批准时刻的正文 hash（与当前文件不同）
    const appliedHash = 'd'.repeat(64);
    const change = await changesRepo.createOnce({
      id: `avh-chg-${randomUUID().slice(0, 8)}`,
      target: { kind: 'content', slug: driftSlug },
      baseHash: BASE_HASH, candidateHash: appliedHash, candidateRef: 'cand-drift',
      sourceRunId: 'run-drift', requestKey: `avh-chg-req-${randomUUID().slice(0, 8)}`,
    });
    const driftApplyBinding = {
      action: 'apply-candidate' as const,
      target: { kind: 'content' as const, slug: driftSlug },
      baseHash: BASE_HASH,
      candidateHash: appliedHash,
      grantId,
      grantRevision: 1,
    };
    await changesRepo.recordApproval({
      id: change.id,
      approval: {
        id: `avh-apply-appr-${randomUUID().slice(0, 8)}`,
        binding: driftApplyBinding,
        bindingHash: contentApprovalHash(driftApplyBinding),
        approvedBy: 'owner',
        approvedAt: new Date().toISOString(),
      },
    });
    const driftApplyReqId = `avh-apply-req-${randomUUID().slice(0, 8)}`;
    await changesRepo.beginApply({ id: change.id, actor: 'owner', requestId: driftApplyReqId });
    await changesRepo.finishApply({ id: change.id, actor: 'owner', requestId: driftApplyReqId, outcome: 'APPLIED', observedHash: appliedHash });
    const binding = {
      action: 'publish-website' as const, target: { kind: 'content' as const, slug: driftSlug },
      baseHash: BASE_HASH, candidateHash: appliedHash, grantId, grantRevision: 1,
    };
    const release = await releasesRepo.createOnce({
      id: `avh-rel-${randomUUID().slice(0, 8)}`,
      changeId: change.id, target: { kind: 'content', slug: driftSlug },
      baseHash: BASE_HASH, sourceHash: appliedHash, versionNote: '漂移测试',
      requestKey: `avh-rel-req-${randomUUID().slice(0, 8)}`,
      publishApproval: {
        id: `avh-appr-${randomUUID().slice(0, 8)}`,
        binding, bindingHash: contentApprovalHash(binding),
        approvedBy: 'owner', approvedAt: new Date().toISOString(),
      },
    });
    await releasesRepo.updateStage({ id: release.id, stage: 'COMMITTING' });
    await releasesRepo.updateStage({ id: release.id, stage: 'PUSHED', gitCommit: 'head-avh' });
    await releasesRepo.updateStage({ id: release.id, stage: 'VERIFYING' });

    // 线上确证成功（发布本身成立），但版本历史必须拒绝写入草稿
    verifier.result = { ok: true, verifiedHash: appliedHash, htmlMatched: true, manifestMatched: true };
    const outcome = await service.verify(release.id);
    expect(outcome.stage).toBe('PUBLISHED');
    expect(await versionStore.readIndex(driftSlug)).toBeNull();

    await db.contentRelease.deleteMany({ where: { targetSlug: driftSlug } });
    await db.contentChange.deleteMany({ where: { targetSlug: driftSlug } });
  });
});
