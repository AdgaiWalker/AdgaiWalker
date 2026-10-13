import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { ContentReleaseService } from './content-release.service';
import {
  CONTENT_RELEASE_REPOSITORY,
  type ContentReleaseRepositoryPort,
} from '../ports/content-release.repository';
import { CONTENT_CHANGE_REPOSITORY, type ContentChangeRepositoryPort } from '../ports/content-change.repository';
import { GIT_STATUS, type GitStatusPort } from '../ports/git-status.repository';
import {
  WEBSITE_DEPLOYMENT_VERIFIER,
  type VerifyWebsiteDeploymentInput,
  type VerifyWebsiteDeploymentResult,
  type WebsiteDeploymentVerifierPort,
} from '../ports/website-deployment-verifier.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { contentApprovalHash } from '../adapters/content-approval.persistence';

const SITE = 'https://verify-test.example';

class FakeVerifier implements WebsiteDeploymentVerifierPort {
  result: VerifyWebsiteDeploymentResult = { ok: true };
  calls: Array<{ url: string; expected: VerifyWebsiteDeploymentInput }> = [];

  async verify(url: string, expected: VerifyWebsiteDeploymentInput): Promise<VerifyWebsiteDeploymentResult> {
    this.calls.push({ url, expected });
    return this.result;
  }

  reset(result: VerifyWebsiteDeploymentResult): void {
    this.result = result;
    this.calls = [];
  }
}

const verifier = new FakeVerifier();

const cleanGit: GitStatusPort = {
  async snapshot() {
    return { available: true, dirtyFiles: [], headCommit: 'head-c16' };
  },
  async workspaceSnapshot() {
    return { available: true, headCommit: 'head-c16', files: [], dirtyFiles: [] };
  },
};

let moduleRef: TestingModule;
let service: ContentReleaseService;
let releasesRepo: ContentReleaseRepositoryPort;
let changesRepo: ContentChangeRepositoryPort;
let contentDir: string;

const SOURCE_HASH = 'b'.repeat(64);
const BASE_HASH = 'a'.repeat(64);
const SLUG = 'c16-verify-post';

async function makeReleaseAtVerifying(): Promise<string> {
  const db = moduleRef.get<PrismaPort>(PRISMA).getClient()!;
  const grantId = `c16-grant-${randomUUID().slice(0, 8)}`;
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
    id: `c16-chg-${randomUUID().slice(0, 8)}`,
    target: { kind: 'content', slug: SLUG },
    baseHash: BASE_HASH,
    candidateHash: SOURCE_HASH,
    candidateRef: 'cand-ref-c16',
    sourceRunId: 'run-source-c16',
    requestKey: `c16-chg-req-${randomUUID().slice(0, 8)}`,
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
    id: `c16-rel-${randomUUID().slice(0, 8)}`,
    changeId: change.id,
    target: { kind: 'content', slug: SLUG },
    baseHash: BASE_HASH,
    sourceHash: SOURCE_HASH,
    requestKey: `c16-rel-req-${randomUUID().slice(0, 8)}`,
    publishApproval: {
      id: `c16-appr-${randomUUID().slice(0, 8)}`,
      binding,
      bindingHash: contentApprovalHash(binding),
      approvedBy: 'owner',
      approvedAt: new Date().toISOString(),
    },
  });

  // 推进到 VERIFYING（真实状态机路径）
  await releasesRepo.updateStage({ id: release.id, stage: 'COMMITTING' });
  await releasesRepo.updateStage({ id: release.id, stage: 'PUSHED', gitCommit: 'head-c16' });
  await releasesRepo.updateStage({ id: release.id, stage: 'VERIFYING' });
  return release.id;
}

describe('C16 线上版本核验器', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c16-content-'));
    const runsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c16-runs-'));
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.WALKER_RUNS_DIR = runsDir;
    process.env.PUBLIC_SITE_URL = SITE;
    await fs.writeFile(path.join(contentDir, `${SLUG}.md`), '---\ntitle: x\n---\nbody\n', 'utf8');

    moduleRef = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
      .overrideProvider(GIT_STATUS).useValue(cleanGit)
      .overrideProvider(WEBSITE_DEPLOYMENT_VERIFIER).useValue(verifier)
      .compile();
    await moduleRef.init();

    service = moduleRef.get(ContentReleaseService);
    releasesRepo = moduleRef.get(CONTENT_RELEASE_REPOSITORY);
    changesRepo = moduleRef.get(CONTENT_CHANGE_REPOSITORY);
  });

  afterAll(async () => {
    const db = moduleRef?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.contentRelease.deleteMany({ where: { targetSlug: { startsWith: 'c16-' } } });
      await db.contentChange.deleteMany({ where: { targetSlug: { startsWith: 'c16-' } } });
      await db.authorizationGrant.deleteMany({ where: { id: { startsWith: 'c16-' } } });
    }
    await moduleRef?.close();
    await fs.rm(contentDir, { recursive: true, force: true });
    delete process.env.CONTENT_LOG_DIR;
    delete process.env.WALKER_RUNS_DIR;
    delete process.env.PUBLIC_SITE_URL;
  });

  it('只有线上确认到目标 hash 才完成网页阶段（VERIFYING → PUBLISHED）', async () => {
    const releaseId = await makeReleaseAtVerifying();
    verifier.reset({ ok: true, verifiedHash: SOURCE_HASH, htmlMatched: true, manifestMatched: true });

    const outcome = await service.verify(releaseId);

    expect(outcome.verified).toBe(true);
    expect(outcome.stage).toBe('PUBLISHED');

    const stored = await releasesRepo.findById(releaseId);
    expect(stored?.stage).toBe('PUBLISHED');
    expect(stored?.verifiedHash).toBe(SOURCE_HASH);
    expect(stored?.verifiedAt).toBeTruthy();

    // 核验请求确实带上了目标 hash 与正确线上地址
    expect(verifier.calls).toHaveLength(1);
    expect(verifier.calls[0]?.url).toBe(`${SITE}/posts/${SLUG}`);
    expect(verifier.calls[0]?.expected.expectedHash).toBe(SOURCE_HASH);
    expect(verifier.calls[0]?.expected.slug).toBe(SLUG);
  });

  it('同标题旧正文（线上 content-hash 不符）绝不能记 PUBLISHED', async () => {
    const releaseId = await makeReleaseAtVerifying();
    verifier.reset({
      ok: false,
      verifiedHash: 'c'.repeat(64),
      htmlMatched: false,
      reason: 'html-hash-mismatch: expected bbbb, observed cccc',
    });

    const outcome = await service.verify(releaseId);

    expect(outcome.verified).toBe(false);
    expect(outcome.reason).toContain('html-hash-mismatch');
    const stored = await releasesRepo.findById(releaseId);
    expect(stored?.stage).toBe('VERIFYING');
    expect(stored?.verifiedHash ?? null).toBeNull();
    expect(stored?.verifiedAt ?? null).toBeNull();
  });

  it('线上未部署 / 404 失败部署不能记 PUBLISHED', async () => {
    const releaseId = await makeReleaseAtVerifying();
    verifier.reset({ ok: false, reason: 'remote-http-404' });

    const outcome = await service.verify(releaseId);

    expect(outcome.verified).toBe(false);
    expect(outcome.reason).toBe('remote-http-404');
    const stored = await releasesRepo.findById(releaseId);
    expect(stored?.stage).toBe('VERIFYING');
  });

  it('即使网页可达，缺少目标 hash 证据也不得放行为已发布', async () => {
    const releaseId = await makeReleaseAtVerifying();
    // 200 + 标题命中，但线上没有任何 content-hash 证据
    verifier.reset({ ok: true, verifiedHash: null });

    const outcome = await service.verify(releaseId);

    expect(outcome.verified).toBe(false);
    const stored = await releasesRepo.findById(releaseId);
    expect(stored?.stage).toBe('VERIFYING');
  });

  it('重复核验幂等：已 PUBLISHED 不再重复请求线上', async () => {
    const releaseId = await makeReleaseAtVerifying();
    verifier.reset({ ok: true, verifiedHash: SOURCE_HASH });
    const first = await service.verify(releaseId);
    expect(first.stage).toBe('PUBLISHED');

    verifier.reset({ ok: false, reason: 'remote-http-500' });
    const second = await service.verify(releaseId);

    expect(second.stage).toBe('PUBLISHED');
    expect(second.verified).toBe(true);
    expect(verifier.calls).toHaveLength(0);
  });

  it('非 VERIFYING 状态的发布不得直接核验为已发布', async () => {
    const releaseId = await makeReleaseAtVerifying();
    await releasesRepo.updateStage({ id: releaseId, stage: 'FAILED', errorCode: 'release-failed' });

    await expect(service.verify(releaseId)).rejects.toMatchObject({
      response: { code: 'content-release-not-verifying' },
    });
  });
});
