import { describe, expect, it } from 'vitest';
import { recoveryDisposition, sameProcess } from './process-recovery.js';

describe('进程恢复身份', () => {
  const recorded = { pid: 41, startedAt: '2026-09-22T00:00:00.000Z' };

  it('PID 被复用时不是原进程', () => {
    expect(sameProcess(recorded, { pid: 41, startedAt: '2026-09-22T00:00:01.000Z' })).toBe(false);
    expect(sameProcess(recorded, recorded)).toBe(true);
  });

  it('只有已退出才释放容量', () => {
    expect(recoveryDisposition('exited')).toBe('release');
    expect(recoveryDisposition('alive')).toBe('occupy');
    expect(recoveryDisposition('reused')).toBe('occupy');
    expect(recoveryDisposition('unproven')).toBe('occupy');
  });

  /**
   * 回归（2026-09-24 实测事故）：一条 pid 为空的 UNKNOWN 记录把**唯一的模型槽永久占死**。
   *
   * `unstarted`（从未启动进程）曾被并进 `unproven`（启动过但无法证明是否还活着），
   * 两者都 occupy。于是恢复逻辑永远无法释放它，调度泵每 2 秒空转一次，
   * 队列再也不推进——系统不是变慢，是**越用越不可用**。
   * 语义边界：没启动过就无所谓终止，释放是安全的。
   */
  it('从未启动过进程可以释放容量（不能与「无法证明」混为一谈）', () => {
    expect(recoveryDisposition('unstarted')).toBe('release');
    // 「无法证明」仍然必须保守占用——这次修复不得放宽它。
    expect(recoveryDisposition('unproven')).toBe('occupy');
  });
});
