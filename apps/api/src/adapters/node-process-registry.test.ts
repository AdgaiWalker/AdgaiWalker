import { describe, expect, it } from 'vitest';
import { classifyProcessLookup } from './node-process-registry';

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
