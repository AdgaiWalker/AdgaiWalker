import { describe, expect, it } from 'vitest';
import { assertModelLinkAllowed, runtimeProbePassed } from './probe-gate';

describe('运行探针门禁', () => {
  it('只接受真实回答、关闭错误为空且进程确认退出的本机探针', () => {
    expect(runtimeProbePassed({ local: {
      status: 'pass', processExited: true, closeError: null,
      answer: { chars: 2, sha256: 'a'.repeat(64) },
    } })).toBe(true);
    expect(runtimeProbePassed({ local: { status: 'pass' } })).toBe(false);
    expect(runtimeProbePassed({ local: {
      status: 'pass', processExited: false, closeError: null,
      answer: { chars: 2, sha256: 'a'.repeat(64) },
    } })).toBe(false);
    expect(runtimeProbePassed({ local: {
      status: 'fail', processExited: false, closeError: null, answer: null,
    } })).toBe(false);
    expect(() => assertModelLinkAllowed()).not.toThrow();
  });
});
