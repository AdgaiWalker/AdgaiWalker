import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function scriptLock() {
  const scriptPath = path.resolve(__dirname, '../../../../scripts/content-publish.ts');
  return await import(/* @vite-ignore */ scriptPath) as {
    CONTENT_PATHS: readonly string[];
    resolveContentLockPath(repoRoot?: string): string;
    tryAcquireScriptLock(lockPath: string): { lockId: string; delegated: boolean } | null;
    releaseScriptLock(lockPath: string, lockId: string): void;
  };
}

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('content:publish 的跨进程锁协议', () => {
  it('API 子进程接续同一锁，手工发布不能插入，且子进程不提前释放父锁', async () => {
    const { tryAcquireScriptLock, releaseScriptLock } = await scriptLock();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-publish-lock-'));
    dirs.push(dir);
    const lockFile = path.join(dir, 'content-publish.lock');
    const lockId = randomUUID();
    fs.writeFileSync(lockFile, JSON.stringify({
      lockId, owner: 'api:test-release', pid: process.pid,
      acquiredAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30_000).toISOString(),
    }));
    vi.stubEnv('WALKER_CONTENT_LOCK_PATH', lockFile);
    vi.stubEnv('WALKER_CONTENT_LOCK_ID', lockId);
    expect(tryAcquireScriptLock(lockFile)).toEqual({ lockId, delegated: true });
    const adopted = JSON.parse(fs.readFileSync(lockFile, 'utf8')) as { owner: string; lockId: string };
    expect(adopted.owner).toContain('script:delegated:');
    expect(adopted.lockId).toBe(lockId);

    vi.stubEnv('WALKER_CONTENT_LOCK_ID', '');
    expect(tryAcquireScriptLock(lockFile)).toBeNull();
    releaseScriptLock(lockFile, lockId);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it('默认脚本锁路径位于 API 本地数据目录', async () => {
    const { resolveContentLockPath } = await scriptLock();
    vi.stubEnv('WALKER_CONTENT_LOCK_PATH', '');
    expect(resolveContentLockPath()).toBe(path.resolve(process.cwd(), '../../apps/api/data/content-publish.lock'));
  });

  it('手工发布从 API 环境文件读取生产锁路径，与运行中的 API 共用持久锁', async () => {
    const { resolveContentLockPath } = await scriptLock();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-lock-config-'));
    dirs.push(dir);
    fs.mkdirSync(path.join(dir, 'apps/api'), { recursive: true });
    const configured = path.join(dir, 'persistent', 'content-publish.lock');
    fs.writeFileSync(path.join(dir, 'apps/api/.env'), `WALKER_CONTENT_LOCK_PATH=${configured}\n`);
    vi.stubEnv('WALKER_CONTENT_LOCK_PATH', '');
    expect(resolveContentLockPath(dir)).toBe(configured);
  });

  it('发布包含受跟踪的正文与图谱投影，构建 manifest 不留在 Git 工作树', async () => {
    const { CONTENT_PATHS } = await scriptLock();
    expect(CONTENT_PATHS).toContain('apps/web/src/generated/content.json');
    expect(CONTENT_PATHS).toContain('apps/web/src/generated/graph.json');
    const repoRoot = path.resolve(process.cwd(), '../..');
    const manifest = 'apps/web/src/generated/public-manifest.json';
    expect(execFileSync('git', ['check-ignore', manifest], { cwd: repoRoot, encoding: 'utf8' }).trim()).toBe(manifest);
    expect(execFileSync('git', ['ls-files', '--', manifest], { cwd: repoRoot, encoding: 'utf8' }).trim()).toBe('');
  });

  it('真实子进程接锁期间第二进程被拒，退出后才可恢复', async () => {
    const { tryAcquireScriptLock, releaseScriptLock } = await scriptLock();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-lock-process-'));
    dirs.push(dir);
    const lockFile = path.join(dir, 'content-publish.lock');
    const lockId = randomUUID();
    fs.writeFileSync(lockFile, JSON.stringify({
      lockId, owner: 'api:process-test', pid: process.pid,
      acquiredAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30_000).toISOString(),
    }));
    const repoRoot = path.resolve(process.cwd(), '../..');
    const scriptUrl = pathToFileURL(path.join(repoRoot, 'scripts/content-publish.ts')).href;
    const source = `import { tryAcquireScriptLock } from ${JSON.stringify(scriptUrl)};\n` +
      `const held = tryAcquireScriptLock(process.env.WALKER_CONTENT_LOCK_PATH);\n` +
      `process.stdout.write(held?.delegated ? 'ADOPTED\\n' : 'DENIED\\n');\n` +
      `await new Promise((resolve) => setTimeout(resolve, 10_000));`;
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
      cwd: repoRoot,
      env: { ...process.env, WALKER_CONTENT_LOCK_PATH: lockFile, WALKER_CONTENT_LOCK_ID: lockId },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      const message = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('child-lock-start-timeout')), 5_000);
        child.stdout.once('data', (chunk: Buffer) => { clearTimeout(timer); resolve(chunk.toString('utf8')); });
        child.once('error', (error) => { clearTimeout(timer); reject(error); });
        child.once('exit', (code) => { if (code !== null && code !== 0) { clearTimeout(timer); reject(new Error(`child-exited-${code}`)); } });
      });
      expect(message).toContain('ADOPTED');
      vi.stubEnv('WALKER_CONTENT_LOCK_ID', '');
      expect(tryAcquireScriptLock(lockFile)).toBeNull();
    } finally {
      child.kill();
      await new Promise<void>((resolve) => child.once('close', () => resolve()));
    }
    const payload = JSON.parse(fs.readFileSync(lockFile, 'utf8')) as Record<string, unknown>;
    fs.writeFileSync(lockFile, JSON.stringify({ ...payload, expiresAt: new Date(Date.now() - 1_000).toISOString() }));
    const recovered = tryAcquireScriptLock(lockFile);
    expect(recovered?.delegated).toBe(false);
    if (recovered) releaseScriptLock(lockFile, recovered.lockId);
  }, 12_000);
});
