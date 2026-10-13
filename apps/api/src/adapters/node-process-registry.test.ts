import { describe, expect, it } from 'vitest';
import { classifyProcessLookup, NodeProcessRegistry } from './node-process-registry';

describe('进程表读取', () => {
  it('命令失败或输出无法解析时不能当成已退出', () => {
    expect(classifyProcessLookup({ error: true, status: null, stdout: '' })).toBe('unreadable');
    expect(classifyProcessLookup({ error: false, status: 0, stdout: 'not-a-date' })).toBe('unreadable');
  });

  it('进程表明确没有该 PID 才是已退出，能解析启动时间才可核对', () => {
    const text = 'Tue Sep 22 00:00:00 2026';
    expect(classifyProcessLookup({ error: false, status: 1, stdout: '' })).toBeNull();
    expect(classifyProcessLookup({ error: false, status: 0, stdout: text })).toBe(new Date(text).toISOString());
  });
});

/**
 * 回归（2026-09-24 实测事故）：pid 为空的记录被判为 unproven → 永久占槽 → 队列永不推进。
 * 契约：没 pid = 从未启动 = unstarted（可释放）；有 pid 但读不到 = unproven（保守占用）。
 */
describe('进程观测：unstarted 与 unproven 必须分开', () => {
  const registry = new NodeProcessRegistry();

  it('没有进程记录，或 pid/启动时间为空 → unstarted（从未启动）', async () => {
    expect(await registry.inspect(null)).toBe('unstarted');
    expect(await registry.inspect({ runId: 'r', bootId: 'b', pid: null, startedAt: null })).toBe('unstarted');
    expect(await registry.inspect({ runId: 'r', bootId: 'b', pid: 12345, startedAt: null })).toBe('unstarted');
  });

  it('terminate 对「从未启动」当作已退出：没有东西需要终止', async () => {
    expect(await registry.terminate(null)).toBe('exited');
    expect(await registry.terminate({ runId: 'r', bootId: 'b', pid: null, startedAt: null })).toBe('exited');
  });

  it('进程表里不存在的 pid → exited（真的退出了）', async () => {
    // 一个几乎不可能被分配的 pid
    expect(await registry.inspect({ runId: 'r', bootId: 'b', pid: 999_999, startedAt: '2026-01-01T00:00:00.000Z' })).toBe('exited');
  });

  it('当前进程自己 → alive（身份吻合）', async () => {
    const registry2 = new NodeProcessRegistry();
    const batch = await registry2.currentBatch();
    // 用当前进程真实启动时间构造记录，应判为 alive
    const { spawnSync } = await import('node:child_process');
    const out = spawnSync('ps', ['-o', 'lstart=', '-p', String(process.pid)], { encoding: 'utf8' }).stdout.trim();
    const startedAt = new Date(out).toISOString();
    expect(await registry2.inspect({ runId: 'r', bootId: batch.bootId, pid: process.pid, startedAt })).toBe('alive');
  });
});
