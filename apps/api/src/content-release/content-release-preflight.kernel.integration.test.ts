import 'reflect-metadata';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { ContentReleaseService } from './content-release.service';
import { GIT_STATUS, type GitStatusPort, type WorkspaceGitStatus } from '../ports/git-status.repository';
import { CONTENT_RELEASE_RUNNER, type ContentReleaseRunnerPort, type ReleaseProcessResult } from '../ports/content-release-runner.port';

const token = 'c12-preflight-token';
const authHeaders = { 'x-admin-token': token, 'content-type': 'application/json' };

let app: INestApplication;
let base: string;
let contentDir: string;
let moduleRef: TestingModule;
let service: ContentReleaseService;

const fakeGitStatus: WorkspaceGitStatus = {
  available: true,
  headCommit: 'c12head0123456789abcdef0123456789abcdef',
  files: [],
  dirtyFiles: [],
};

const mockGitPort: GitStatusPort = {
  async snapshot() {
    return {
      available: fakeGitStatus.available,
      dirtyFiles: fakeGitStatus.dirtyFiles.map((f) => path.basename(f)),
      headCommit: fakeGitStatus.headCommit,
    };
  },
  async workspaceSnapshot() {
    return { ...fakeGitStatus };
  },
};

const fakeRunner: ContentReleaseRunnerPort = {
  async runRelease(): Promise<ReleaseProcessResult> {
    return { exitCode: 0, stdout: '{"tail":["ok"]}', stderr: '', timedOut: false, exitProof: 'exited' };
  },
};

const VALID_POST_A = `---
title: 文章A
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
summary: 文章A摘要
---
# 正文A
`;

describe('C12 实际发布范围预检与 manifest 生成', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c12-content-'));
    vi.stubEnv('WALKER_ADMIN_TOKEN', token);
    vi.stubEnv('CONTENT_LOG_DIR', contentDir);

    await fs.writeFile(path.join(contentDir, 'post-a.md'), VALID_POST_A, 'utf8');

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GIT_STATUS).useValue(mockGitPort)
      .overrideProvider(CONTENT_RELEASE_RUNNER).useValue(fakeRunner)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();

    service = app.get(ContentReleaseService);
  });

  afterAll(async () => {
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    fakeGitStatus.available = true;
    fakeGitStatus.files = [];
    fakeGitStatus.dirtyFiles = [];
  });

  it('A 发布时 B 也脏返回 scope-conflict，不能只检查 A 的 frontmatter', async () => {
    // 模拟：工作区中 post-a 与 post-b 均脏
    fakeGitStatus.files = [
      { path: 'content/log/post-a.md', staged: false, dirty: true, statusCode: ' M' },
      { path: 'content/log/post-b.md', staged: false, dirty: true, statusCode: ' M' },
    ];
    fakeGitStatus.dirtyFiles = ['content/log/post-a.md', 'content/log/post-b.md'];

    // 预检返回 scopeConflict
    const preflight = await service.preflight('post-a');
    expect(preflight.ok).toBe(false);
    expect(preflight.missing).toEqual([]);
    expect(preflight.scopeConflict?.reason).toBe('other-content-dirty');
    expect(preflight.scopeConflict?.details).toContain('content/log/post-b.md');

    // 触发发布时直接抛出 scope-conflict 409
    await expect(service.release({ slug: 'post-a', releaseId: 'unused' })).rejects.toMatchObject({
      response: { code: 'scope-conflict' },
    });
  });

  it('当 support-config 发生未提交变更时，拒绝发布并返回 scope-conflict', async () => {
    fakeGitStatus.files = [
      { path: 'content/log/post-a.md', staged: false, dirty: true, statusCode: ' M' },
      { path: 'content/support-config.json', staged: false, dirty: true, statusCode: ' M' },
    ];
    fakeGitStatus.dirtyFiles = ['content/log/post-a.md', 'content/support-config.json'];

    const preflight = await service.preflight('post-a');
    expect(preflight.ok).toBe(false);
    expect(preflight.scopeConflict?.reason).toBe('support-config-dirty');

    await expect(service.release({ slug: 'post-a', releaseId: 'unused' })).rejects.toMatchObject({
      response: { code: 'scope-conflict' },
    });
  });

  it('当工作区存在未提交代码时，触发“不夹带代码”检查并拒绝发布', async () => {
    fakeGitStatus.files = [
      { path: 'content/log/post-a.md', staged: false, dirty: true, statusCode: ' M' },
      { path: 'apps/api/src/main.ts', staged: false, dirty: true, statusCode: ' M' },
    ];
    fakeGitStatus.dirtyFiles = ['content/log/post-a.md', 'apps/api/src/main.ts'];

    const preflight = await service.preflight('post-a');
    expect(preflight.ok).toBe(false);
    expect(preflight.scopeConflict?.reason).toBe('code-dirty');
    expect(preflight.scopeConflict?.details).toContain('apps/api/src/main.ts');

    await expect(service.release({ slug: 'post-a', releaseId: 'unused' })).rejects.toMatchObject({
      response: { code: 'scope-conflict' },
    });
  });

  it('工作区无范围冲突且字段齐全时，生成结构化 manifest，hash 稳定可见', async () => {
    fakeGitStatus.files = [
      { path: 'content/log/post-a.md', staged: false, dirty: true, statusCode: ' M' },
    ];
    fakeGitStatus.dirtyFiles = ['content/log/post-a.md'];

    const preflight1 = await service.preflight('post-a');
    expect(preflight1.ok).toBe(true);
    expect(preflight1.missing).toEqual([]);
    expect(preflight1.scopeConflict).toBeNull();
    expect(preflight1.manifest).toBeDefined();

    const manifest = preflight1.manifest!;
    expect(manifest.targetSlug).toBe('post-a');
    expect(manifest.headCommit).toBe(fakeGitStatus.headCommit);
    expect(manifest.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.targetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.items.length).toBe(1);
    expect(manifest.items[0]?.path).toBe('content/log/post-a.md');

    // 稳定性验证：相同内容再次预检，hash 稳定不变
    const preflight2 = await service.preflight('post-a');
    expect(preflight2.manifest?.manifestHash).toBe(manifest.manifestHash);
    expect(preflight2.manifest?.targetHash).toBe(manifest.targetHash);
  });

  it('HTTP POST /admin/content/release/preflight 端点返回完整预检与 manifest 视图', async () => {
    fakeGitStatus.files = [
      { path: 'content/log/post-a.md', staged: false, dirty: true, statusCode: ' M' },
    ];
    fakeGitStatus.dirtyFiles = ['content/log/post-a.md'];

    const res = await fetch(`${base}/admin/content/release/preflight`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ slug: 'post-a' }),
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { ok: boolean; manifest: { manifestHash: string } };
    expect(data.ok).toBe(true);
    expect(data.manifest.manifestHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
