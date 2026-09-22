import { describe, expect, it } from 'vitest';
import { CredentialRuntimePool, runtimePoolKey } from './credential-pool';

describe('凭据 runtime 池', () => {
  it('轮换后旧修订不能再接新调用，进行中的调用不在这里被杀掉', () => {
    const pool = new CredentialRuntimePool();
    const secret = 'sk-live-secret-should-not-appear';
    pool.claim('deepseek', 0);
    const retired = pool.retire('deepseek', 0);
    pool.publish('deepseek', 1);
    expect(retired.inflight).toBe(1);
    expect(() => pool.claim('deepseek', 0)).toThrow('credential-revision-retired');
    expect(pool.claim('deepseek', 1)).toBe('deepseek:1');
    expect(runtimePoolKey('deepseek', 1)).not.toContain(secret);
    expect(retired.key).not.toContain(secret);
  });
});
