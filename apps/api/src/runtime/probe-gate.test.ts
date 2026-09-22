import { describe, expect, it } from 'vitest';
import { assertModelLinkAllowed, runtimeProbePassed } from './probe-gate';

describe('运行探针门禁', () => {
  it('网页版不因 Windows 未跑而关闭模型链路', () => {
    expect(runtimeProbePassed({ local: { status: 'pass' } })).toBe(true);
    expect(() => assertModelLinkAllowed()).not.toThrow();
  });
});
