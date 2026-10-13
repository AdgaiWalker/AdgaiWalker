import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PnpmContentReleaseRunner } from './pnpm-content-release.runner';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

/** 假子进程：可控 stdout/stderr 与关闭时刻 */
class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = 0;
  kill(): boolean {
    this.killed += 1;
    return true;
  }
}

function stubSpawn(): FakeChild {
  const child = new FakeChild();
  spawnMock.mockReturnValue(child);
  return child;
}

afterEach(() => {
  spawnMock.mockReset();
  delete process.env.WALKER_RELEASE_TIMEOUT_MS;
  vi.useRealTimers();
});

describe('发布进程适配器（唯一出口，参数全常量）', () => {
  it('spawn 的参数是固定常量：调用方没有任何输入能进命令行（PRD A8）', async () => {
    const child = stubSpawn();
    const runner = new PnpmContentReleaseRunner();
    expect(runner.runRelease.length).toBe(0); // 无入参 → 结构上不存在外部文本插值

    const pending = runner.runRelease();
    child.emit('close', 0);
    await pending;

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args, options] = spawnMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(cmd).toBe('pnpm');
    expect(args).toEqual(['content:publish', '--push', '--json']);
    expect(options.stdio).toEqual(['ignore', 'pipe', 'pipe']);
    expect(options.shell).toBe(process.platform === 'win32');
  });

  it('API 持锁发布把锁路径和标识交给脚本环境，不放入命令参数', async () => {
    const child = stubSpawn();
    const runner = new PnpmContentReleaseRunner();
    const pending = runner.runRelease({
      lock: { lockFile: '/tmp/walker-lock', lockId: 'test-lock-id' },
    } as Parameters<typeof runner.runRelease>[0]);
    child.emit('close', 0);
    await pending;

    const [, args, options] = spawnMock.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }];
    expect(args).toEqual(['content:publish', '--push', '--json']);
    expect(options.env.WALKER_CONTENT_LOCK_PATH).toBe('/tmp/walker-lock');
    expect(options.env.WALKER_CONTENT_LOCK_ID).toBe('test-lock-id');
  });

  it('如实回报退出码与输出（含 stderr）', async () => {
    const child = stubSpawn();
    const runner = new PnpmContentReleaseRunner();
    const pending = runner.runRelease();
    child.stdout.emit('data', Buffer.from('{"exitCode":0,"elapsedMs":3,"tail":["ok"]}\n'));
    child.stderr.emit('data', Buffer.from('warning: something\n'));
    child.emit('close', 0);

    const result = await pending;
    expect(result).toMatchObject({ exitCode: 0, timedOut: false });
    expect(result.stdout).toContain('"exitCode":0');
    expect(result.stderr).toContain('warning: something');
  });

  it('超时强杀：timedOut=true 且 exitCode 为 null（失败事实，不当成功）', async () => {
    process.env.WALKER_RELEASE_TIMEOUT_MS = '5';
    const runner = new PnpmContentReleaseRunner();
    const child = new FakeChild();
    child.kill = () => {
      child.killed += 1;
      setImmediate(() => child.emit('close', null));
      return true;
    };
    spawnMock.mockReturnValue(child);

    const result = await runner.runRelease();
    expect(child.killed).toBe(1);
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(result.exitProof).toBe('exited');
  });

  it('spawn 失败（如 pnpm 不存在）：报为失败而非异常抛出', async () => {
    const child = stubSpawn();
    const runner = new PnpmContentReleaseRunner();
    const pending = runner.runRelease();
    child.emit('error', new Error('spawn pnpm ENOENT'));

    const result = await pending;
    expect(result.exitCode).toBeNull();
    expect(result.stderr).toContain('spawn pnpm ENOENT');
  });

  it('支持外部 AbortSignal 与 onSpawn 回调登记子进程归属', async () => {
    const child = stubSpawn();
    (child as unknown as { pid: number }).pid = 4321;
    const runner = new PnpmContentReleaseRunner();
    const controller = new AbortController();
    let observedPid = 0;

    const pending = runner.runRelease({
      signal: controller.signal,
      onSpawn: (pid) => { observedPid = pid; },
    });

    expect(observedPid).toBe(4321);

    controller.abort();
    child.emit('close', null);

    const result = await pending;
    expect(result.exitCode).toBeNull();
  });
});
