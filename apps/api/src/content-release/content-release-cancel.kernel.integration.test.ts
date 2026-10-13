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
  type RunReleaseOptions,
} from '../ports/content-release-runner.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { contentApprovalHash } from '../adapters/content-approval.persistence';

const SITE = 'https://cancel-test.example';

class FakeVerifier implements WebsiteDeploymentVerifierPort {
  result: VerifyWebsiteDeploymentResult = { ok: false, reason: 'remote-http-404' };
  async verify(_url: string, _expected: VerifyWebsiteDeploymentInput): Promise<VerifyWebsiteDeploymentResult> {
    return this.result;
  }
}

const verifier = new FakeVerifier();

class ControllableRunner implements ContentReleaseRunnerPort {
  calls = 0;
  terminatedPids: number[] = [];
  spawnedPid = 9876;
  private pendingPromise?: Promise<ReleaseProcessResult>;
  private resolver?: (res: ReleaseProcessResult) => void;

  async runRelease(...args: [RunReleaseOptions?]): Promise<ReleaseProcessResult> {
    this.calls += 1;
    const options = args[0];
    options?.onSpawn?.(this.spawnedPid);

    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        if (this.resolver) {
          this.resolver({ exitCode: null, timedOut: false, exitProof: 'exited', stdout: '', stderr: 'aborted' });
          this.resolver = undefined;
        }
      });
    }

    return new Promise<ReleaseProcessResult>((resolve) => {
      this.resolver = resolve;
    });
  }

  async terminateProcessTree(pid: number): Promise<'exited' | 'unproven'> {
    this.terminatedPids.push(pid);
    return 'exited';
  }

  reset() {
    this.calls = 0;
    this.terminatedPids = [];
    this.resolver = undefined;
  }
}

const runner = new ControllableRunner();

const mockWorkspaceStatus: WorkspaceGitStatus = {
  available: true,
  headCommit: 'head-c19',
  files: [],
  dirtyFiles: [],
};

const mockGit: GitStatusPort = {
  async snapshot() {
    return { available: true, dirtyFiles: [], headCommit: 'head-c19' };
  },
  async workspaceSnapshot() {
    return mockWorkspaceStatus;
  },
  async hasCommit(_commit: string) {
    return true;
  },
};

let moduleRef: TestingModule;
let service: ContentReleaseService;
let releasesRepo: ContentReleaseRepositoryPort;
let changesRepo: ContentChangeRepositoryPort;
let contentDir: string;

const SLUG = 'c19-cancel-post';
const SOURCE_HASH = 'd'.repeat(64);
const BASE_HASH = 'c'.repeat(64);

async function makeFixtureRelease(stage: 'COMMITTING' | 'PUSHED' | 'VERIFYING' | 'UNKNOWN', gitCommit?: string | null): Promise<string> {
  const db = moduleRef.get<PrismaPort>(PRISMA).getClient()!;
  const grantId = `c19-grant-${randomUUID().slice(0, 8)}`;
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
    id: `c19-chg-${randomUUID().slice(0, 8)}`,
    target: { kind: 'content', slug: SLUG },
    baseHash: BASE_HASH,
    candidateHash: SOURCE_HASH,
    candidateRef: 'cand-ref-c19',
    sourceRunId: 'run-source-c19',
    requestKey: `c19-chg-req-${randomUUID().slice(0, 8)}`,
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
    id: `c19-rel-${randomUUID().slice(0, 8)}`,
    changeId: change.id,
    target: { kind: 'content', slug: SLUG },
    baseHash: BASE_HASH,
    sourceHash: SOURCE_HASH,
    requestKey: `c19-rel-req-${randomUUID().slice(0, 8)}`,
    publishApproval: {
      id: `c19-appr-${randomUUID().slice(0, 8)}`,
      binding,
      bindingHash: contentApprovalHash(binding),
      approvedBy: 'owner',
      approvedAt: new Date().toISOString(),
    },
  });

  await db.contentRelease.update({
    where: { id: release.id },
    data: {
      stage,
      gitCommit: gitCommit ?? null,
    },
  });

  return release.id;
}

describe('C19 发布脚本的进程树终止核验（Kernel 集成测试）', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c19-content-'));
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
      await db.contentRelease.deleteMany({ where: { targetSlug: { startsWith: 'c19-' } } });
      await db.contentChange.deleteMany({ where: { targetSlug: { startsWith: 'c19-' } } });
      await db.authorizationGrant.deleteMany({ where: { id: { startsWith: 'c19-' } } });
    }
    await moduleRef?.close();
    await fs.rm(contentDir, { recursive: true, force: true });
    delete process.env.CONTENT_LOG_DIR;
    delete process.env.PUBLIC_SITE_URL;
  });

  afterEach(() => {
    runner.reset();
    verifier.result = { ok: false, reason: 'remote-http-404' };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('COMMITTING 可能已进入推送，取消后保持 UNKNOWN 等待事实核对', async () => {
    const releaseId = await makeFixtureRelease('COMMITTING', null);

    // 触发取消
    const cancelRes = await service.cancel(releaseId);

    expect(cancelRes.cancelled).toBe(false);
    expect(cancelRes.stage).toBe('UNKNOWN');
    expect(cancelRes.message).toContain('核对');

    const stored = await releasesRepo.findById(releaseId);
    expect(stored?.stage).toBe('UNKNOWN');
  });

  it('push 已派发（PUSHED / VERIFYING）时请求停止：绝不能标为“取消且未发布”，转为核对实际效果', async () => {
    const releaseId = await makeFixtureRelease('PUSHED', 'commit-already-pushed-c19');

    // 线上未生效
    verifier.result = { ok: false, reason: 'remote-http-404' };

    const cancelRes = await service.cancel(releaseId);

    // 核心红线断言：不能标为已取消！
    expect(cancelRes.cancelled).toBe(false);
    // 状态必须保留事实状态（VERIFYING），绝不能是 FAILED！
    expect(cancelRes.stage).toBe('VERIFYING');
    expect(cancelRes.message).toContain('无法直接取消');

    const stored = await releasesRepo.findById(releaseId);
    expect(stored?.stage).toBe('VERIFYING');
    expect(stored?.stage).not.toBe('FAILED');
  });

  it('push 已派发且线上已被确证上线：请求停止核对确证为 PUBLISHED', async () => {
    const releaseId = await makeFixtureRelease('PUSHED', 'commit-already-pushed-c19');

    // 线上 verifier 证实目标版本实际已上线
    verifier.result = { ok: true, verifiedHash: SOURCE_HASH, htmlMatched: true };

    const cancelRes = await service.cancel(releaseId);

    expect(cancelRes.cancelled).toBe(false);
    expect(cancelRes.stage).toBe('PUBLISHED');
    expect(cancelRes.message).toContain('已确证为已发布');

    const stored = await releasesRepo.findById(releaseId);
    expect(stored?.stage).toBe('PUBLISHED');
    expect(stored?.verifiedHash).toBe(SOURCE_HASH);
  });
});
