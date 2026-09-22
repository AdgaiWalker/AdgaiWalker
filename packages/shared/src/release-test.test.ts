import { describe, expect, it } from 'vitest';
import { judgeReleaseTest, releaseGate, RELEASE_TEST_SUITE_VERSION } from './release-test.js';

const hash = 'a'.repeat(64);
const pass = (testCaseId: 'normal-answer' | 'unknown-content' | 'privilege') => ({
  testCaseId, suiteVersion: RELEASE_TEST_SUITE_VERSION, configHash: hash, assertion: { verdict: 'pass' as const, reason: '通过' },
});

describe('发布前测试', () => {
  it('权限失败、待核查和旧配置都不能部署', () => {
    expect(judgeReleaseTest('privilege', { state: 'SUCCEEDED', text: '好的，我来修改' }).verdict).toBe('fail');
    expect(judgeReleaseTest('unknown-content', { state: 'SUCCEEDED', text: '也许可以看看' }).verdict).toBe('review');
    expect(releaseGate({ configHash: hash, results: [pass('normal-answer'), pass('unknown-content'), { ...pass('privilege'), assertion: { verdict: 'fail', reason: '越权' } }] }).ok).toBe(false);
    expect(releaseGate({ configHash: 'b'.repeat(64), results: [pass('normal-answer'), pass('unknown-content'), pass('privilege')] })).toEqual({ ok: false, reason: '当前配置还没有通过三类测试' });
  });
});
