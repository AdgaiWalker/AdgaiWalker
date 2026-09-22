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
});
