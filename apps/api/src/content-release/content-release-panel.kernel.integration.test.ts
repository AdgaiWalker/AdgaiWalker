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
import { ContentReleaseService } from './content-release.service';
import { CONTENT_RELEASE_REPOSITORY, type ContentReleaseRepositoryPort } from '../ports/content-release.repository';
import { CONTENT_CHANGE_REPOSITORY, type ContentChangeRepositoryPort } from '../ports/content-change.repository';
import { GIT_STATUS, type GitStatusPort, type WorkspaceGitStatus } from '../ports/git-status.repository';
import { CONTENT_RELEASE_RUNNER, type ContentReleaseRunnerPort, type ReleaseProcessResult } from '../ports/content-release-runner.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

const token = 'c20-panel-token';
let app: INestApplication;
let contentDir: string;
let lockFile: string;
let moduleRef: TestingModule;
let service: ContentReleaseService;
let baseUrl: string;

class MockRunner implements ContentReleaseRunnerPort {
  calls = 0;
  async runRelease(): Promise<ReleaseProcessResult> {
    this.calls += 1;
    return { exitCode: 0, timedOut: false, exitProof: 'exited', stdout: 'SUCCESS', stderr: '' };
  }
}

const runner = new MockRunner();

const fakeGitStatus: WorkspaceGitStatus = {
  available: true,
  headCommit: 'commit-c20-head-12345',
  files: [{ path: 'content/log/c20-post.md', staged: false, dirty: true, statusCode: ' M' }],
  dirtyFiles: ['content/log/c20-post.md'],
};

const mockGitPort: GitStatusPort = {
  async snapshot() {
    return { available: true, dirtyFiles: ['c20-post.md'], headCommit: fakeGitStatus.headCommit };
  },
  async workspaceSnapshot() {
    return { ...fakeGitStatus };
  },
};

const POST_CONTENT = `---
title: C20 发布面板文章
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
summary: C20 验收测试
---
# C20 正文内容
`;

describe('C20 接通发布清单和版本状态界面（Kernel 集成测试）', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c20-content-'));
    const runsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c20-runs-'));
    const lockDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c20-lock-'));
    lockFile = path.join(lockDir, 'content-publish.lock');

    process.env.WALKER_ADMIN_TOKEN = token;
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.WALKER_RUNS_DIR = runsDir;
    process.env.WALKER_CONTENT_LOCK_PATH = lockFile;

    await fs.writeFile(path.join(contentDir, 'c20-post.md'), POST_CONTENT, 'utf8');

    moduleRef = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
      .overrideProvider(GIT_STATUS).useValue(mockGitPort)
      .overrideProvider(CONTENT_RELEASE_RUNNER).useValue(runner)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 8788;
    baseUrl = `http://127.0.0.1:${port}`;

    service = app.get(ContentReleaseService);
  });

  afterAll(async () => {
    const db = app?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.auditRecord.deleteMany({ where: { targetId: { startsWith: 'c20-' } } });
      await db.contentRelease.deleteMany({ where: { targetSlug: { startsWith: 'c20-' } } });
      await db.contentChange.deleteMany({ where: { targetSlug: { startsWith: 'c20-' } } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    if (lockFile) await fs.rm(path.dirname(lockFile), { recursive: true, force: true });
    delete process.env.WALKER_ADMIN_TOKEN;
    delete process.env.CONTENT_LOG_DIR;
    delete process.env.WALKER_CONTENT_LOCK_PATH;
  });

  it('GET /admin/content/release/:slug/version 返回编辑/网页/问答三版本状态', async () => {
    const res = await fetch(`${baseUrl}/admin/content/release/c20-post/version`, {
      headers: { 'x-admin-token': token },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('workingHash');
    expect(body.workingHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body).toHaveProperty('publishedHash');
    expect(body).toHaveProperty('indexedHash');
  });

  it('POST /admin/content/release/preflight 返回稳定清单 manifest 及提交文件范围', async () => {
    const res = await fetch(`${baseUrl}/admin/content/release/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ slug: 'c20-post' }),
    });
    expect([200, 201]).toContain(res.status);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.manifest).toBeDefined();
    expect(body.manifest.targetSlug).toBe('c20-post');
    expect(body.manifest.headCommit).toBe('commit-c20-head-12345');
    expect(body.manifest.items.length).toBeGreaterThan(0);
    expect(body.manifest.items[0].path).toBe('content/log/c20-post.md');
  });

  it('POST /admin/content/release/prepare 生成独立发布批准并返回 PREPARED 记录', async () => {
    const res = await fetch(`${baseUrl}/admin/content/release/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ slug: 'c20-post', versionNote: 'C20 测试发布' }),
    });
    expect(res.status).toBe(201);
    const release = await res.json();
    expect(release.id).toMatch(/^rel_/);
    expect(release.target.slug).toBe('c20-post');
    expect(release.stage).toBe('PREPARED');
    expect(release.publishApproval).toBeDefined();
    expect(release.publishApproval.binding.action).toBe('publish-website');

    // 验证 GET /admin/content/release/target/:slug/latest
    const latestRes = await fetch(`${baseUrl}/admin/content/release/target/c20-post/latest`, {
      headers: { 'x-admin-token': token },
    });
    expect(latestRes.status).toBe(200);
    const latest = await latestRes.json();
    expect(latest.id).toBe(release.id);
    expect(latest.stage).toBe('PREPARED');

    // 验证 GET /admin/content/release/record/:id
    const detailRes = await fetch(`${baseUrl}/admin/content/release/record/${release.id}`, {
      headers: { 'x-admin-token': token },
    });
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json();
    expect(detail.id).toBe(release.id);
  });

  it('POST /admin/content/release 缺少发布单时拒绝且不派发脚本', async () => {
    const before = runner.calls;
    const res = await fetch(`${baseUrl}/admin/content/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ slug: 'c20-post' }),
    });
    expect(res.status).toBe(400);
    expect(runner.calls).toBe(before);
  });

  it('准备发布时显式填写无效授权编号必须拒绝', async () => {
    const res = await fetch(`${baseUrl}/admin/content/release/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ slug: 'c20-post', grantId: 'missing-l2-grant', versionNote: 'C20 测试发布' }),
    });
    expect(res.status).toBe(403);
  });

  it('POST /admin/content/release 携带 releaseId 触发上线', async () => {
    const prepRes = await fetch(`${baseUrl}/admin/content/release/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ slug: 'c20-post', requestKey: `c20-prep-${Date.now()}`, versionNote: 'C20 测试发布' }),
    });
    const prep = await prepRes.json();

    const triggerRes = await fetch(`${baseUrl}/admin/content/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ slug: 'c20-post', releaseId: prep.id }),
    });
    expect(triggerRes.status).toBe(201);
    const trigger = await triggerRes.json();
    expect(trigger.runId).toBeDefined();
    expect(['RUNNING', 'SUCCESS']).toContain(trigger.status);
  });
});
