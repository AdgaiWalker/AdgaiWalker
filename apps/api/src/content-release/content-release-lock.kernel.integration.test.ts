import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { ContentReleaseService } from './content-release.service';
import { CONTENT_LOCK, type ContentLockPort } from '../ports/content-lock.port';
import { FsContentLock } from '../adapters/fs-content-lock';
import { CONTENT_MUTATION_SERVICE, type ContentMutationPort } from '../ports/content-mutation.port';
import { CONTENT_FILE_REPOSITORY, type ContentFileRepositoryPort } from '../ports/content-file.repository';
import { GIT_STATUS, type GitStatusPort, type WorkspaceGitStatus } from '../ports/git-status.repository';
import { CONTENT_RELEASE_RUNNER, type ContentReleaseRunnerPort, type ReleaseProcessResult } from '../ports/content-release-runner.port';

const token = 'c13-lock-token';
let app: INestApplication;
let contentDir: string;
let lockFile: string;
let moduleRef: TestingModule;
let service: ContentReleaseService;
let mutation: ContentMutationPort;
let lockPort: ContentLockPort;

const fakeGitStatus: WorkspaceGitStatus = {
  available: true,
  headCommit: 'head-c13',
  files: [],
  dirtyFiles: [],
};

const mockGitPort: GitStatusPort = {
  async snapshot() {
    return { available: true, dirtyFiles: ['post-lock.md'], headCommit: 'head-c13' };
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

const VALID_POST = `---
title: 锁定文章
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
summary: 锁定文章摘要
---
# 正文内容
`;

describe('C13 全工作区发布锁和清单复检', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c13-content-'));
    const lockDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c13-lock-'));
    lockFile = path.join(lockDir, 'content-publish.lock');

    vi.stubEnv('WALKER_ADMIN_TOKEN', token);
    vi.stubEnv('CONTENT_LOG_DIR', contentDir);
    vi.stubEnv('WALKER_CONTENT_LOCK_PATH', lockFile);

    await fs.writeFile(path.join(contentDir, 'post-lock.md'), VALID_POST, 'utf8');

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GIT_STATUS).useValue(mockGitPort)
      .overrideProvider(CONTENT_RELEASE_RUNNER).useValue(fakeRunner)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');

    service = app.get(ContentReleaseService);
    mutation = app.get(CONTENT_MUTATION_SERVICE);
    lockPort = app.get(CONTENT_LOCK);
  });

  afterAll(async () => {
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    if (lockFile) await fs.rm(path.dirname(lockFile), { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await fs.rm(lockFile, { force: true });
    fakeGitStatus.available = true;
    fakeGitStatus.files = [{ path: 'content/log/post-lock.md', staged: false, dirty: true, statusCode: ' M' }];
    fakeGitStatus.dirtyFiles = ['content/log/post-lock.md'];
  });

  it('发布持有锁期间，工作区保存被拦截 (409 content-locked)，防止并行混入', async () => {
    // 1. 模拟活跃的发布锁被持有
    const acquired = await lockPort.tryAcquire({
      owner: 'script:content-publish:1234',
      targetSlug: 'post-lock',
    });
    expect(acquired).not.toBeNull();

    // 2. 在锁被持有期间尝试人工保存
    const files = app.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
    const initialDoc = (await files.get('post-lock'))!;

    await expect(
      mutation.saveManual({
        slug: 'post-lock',
        raw: VALID_POST + '\n尝试在发布期间混入的修改\n',
        expectedHash: initialDoc.hash,
        actor: 'owner',
        requestId: 'c13-req-conflict',
      }),
    ).rejects.toMatchObject({
      response: { code: 'content-locked' },
    });

    // 3. 正本未被修改
    const docAfter = await files.get('post-lock');
    expect(docAfter?.hash).toBe(initialDoc.hash);

    // 4. 释放锁后保存即可恢复正常
    await lockPort.release(acquired!.payload.lockId);
    const saved = await mutation.saveManual({
      slug: 'post-lock',
      raw: VALID_POST + '\n正常保存\n',
      expectedHash: initialDoc.hash,
      actor: 'owner',
      requestId: 'c13-req-ok',
    });
    expect(saved).toBeDefined();
  });

  it('构建提交前复检发现工作区发生额外变动，原发布批准与清单失效 (锁外变化可检测)', async () => {
    // 模拟预检正常
    const preflight = await service.preflight('post-lock');
    expect(preflight.ok).toBe(true);
    expect(preflight.manifest).toBeDefined();

    // 模拟在预检之后、真实执行前，工作区有另一个文件 post-other 变脏了
    fakeGitStatus.files.push({
      path: 'content/log/post-other.md',
      staged: false,
      dirty: true,
      statusCode: ' M',
    });
    fakeGitStatus.dirtyFiles.push('content/log/post-other.md');

    // 触发发布时，第二阶段预检复查将立刻截获额外变动并停止发布
    await expect(service.release({ slug: 'post-lock', releaseId: 'unused' })).rejects.toMatchObject({
      response: { code: 'scope-conflict' },
    });

    // 锁已释放，未遗留死锁
    const activeLock = await lockPort.inspect();
    expect(activeLock).toBeNull();
  });

  it('超时或崩溃锁具有可核验恢复机制，不永久锁死', async () => {
    // 写入一个已超时的死锁（或 PID 不存在的进程）
    const expiredPayload = {
      lockId: 'lock-crashed-proc',
      owner: 'crashed-worker',
      pid: 9999999, // 不存在的 PID
      acquiredAt: new Date(Date.now() - 400_000).toISOString(),
      expiresAt: new Date(Date.now() - 100_000).toISOString(), // 已过期
      targetSlug: 'post-lock',
      manifestHash: 'old-hash',
    };
    await fs.mkdir(path.dirname(lockFile), { recursive: true });
    await fs.writeFile(lockFile, JSON.stringify(expiredPayload, null, 2), 'utf8');

    // 新的发布请求尝试获取锁：可核验恢复机制将接管并自动覆盖该死锁
    const takeOver = await lockPort.tryAcquire({
      owner: 'api:new-release-worker',
      targetSlug: 'post-lock',
    });
    expect(takeOver).not.toBeNull();
    expect(takeOver?.payload.owner).toBe('api:new-release-worker');
    expect(takeOver?.payload.lockId).not.toBe('lock-crashed-proc');

    // 释放接管后的新锁
    const released = await lockPort.release(takeOver!.payload.lockId);
    expect(released).toBe(true);
  });

  it('持锁进程仍存活时即使超过租期也不能接管或写入正本', async () => {
    const acquired = await lockPort.tryAcquire({ owner: 'api:long-release', targetSlug: 'post-lock' });
    expect(acquired).not.toBeNull();
    await fs.writeFile(lockFile, JSON.stringify({
      ...acquired!.payload,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    }), 'utf8');

    expect(await lockPort.tryAcquire({ owner: 'script:concurrent-release' })).toBeNull();
    const files = app.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
    const current = (await files.get('post-lock'))!;
    await expect(mutation.saveManual({
      slug: 'post-lock', raw: current.raw + '\n并发写入\n', expectedHash: current.hash,
      actor: 'owner', requestId: 'c13-expired-live-owner',
    })).rejects.toMatchObject({ response: { code: 'content-locked' } });
  });

  it('两个进程同时接管过期死锁时只能有一个成功', async () => {
    await fs.writeFile(lockFile, JSON.stringify({
      lockId: 'dead-lock', owner: 'crashed-worker', pid: 9999999,
      acquiredAt: new Date(Date.now() - 600_000).toISOString(),
      expiresAt: new Date(Date.now() - 300_000).toISOString(),
    }));
    const first = new FsContentLock(lockFile);
    const second = new FsContentLock(lockFile);
    const attempts = await Promise.all([
      first.tryAcquire({ owner: 'recover-a' }),
      second.tryAcquire({ owner: 'recover-b' }),
    ]);
    expect(attempts.filter(Boolean)).toHaveLength(1);
  });

  it('死锁恢复正在进行时正本写入仍视为被锁定', async () => {
    await fs.writeFile(lockFile, JSON.stringify({
      lockId: 'dead-with-recovery', owner: 'crashed-worker', pid: 9999999,
      acquiredAt: new Date(Date.now() - 600_000).toISOString(),
      expiresAt: new Date(Date.now() - 300_000).toISOString(),
    }));
    const recoveryFile = `${lockFile}.recovery`;
    await fs.writeFile(recoveryFile, JSON.stringify({ pid: process.pid, at: Date.now() }));
    try {
      expect(await lockPort.isLocked()).toBe(true);
    } finally {
      await fs.rm(recoveryFile, { force: true });
    }
  });

  it('恢复互斥文件尚在时不得创建新锁，即使主锁文件暂时不存在', async () => {
    const recoveryFile = `${lockFile}.recovery`;
    await fs.writeFile(recoveryFile, JSON.stringify({ pid: process.pid, at: Date.now() }));
    try {
      expect(await lockPort.tryAcquire({ owner: 'racing-new-publisher' })).toBeNull();
    } finally {
      await fs.rm(recoveryFile, { force: true });
    }
  });
});
