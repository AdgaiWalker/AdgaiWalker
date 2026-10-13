import { describe, expect, it } from 'vitest';
import { grantAllows, grantUsable, grantRemaining, parseGrantInput, pickUsableGrant, type AuthorizationGrantView } from './authorization';
const input = { requestKey: 'grant-test-1', level: 'L2', agentId: 'agent-a', actions: ['content:apply'], resourceScope: { kind: 'content', ids: ['post-a'] }, expiresAt: '2027-01-01T00:00:00.000Z', runLimit: 1, usageLimit: 1000 };
const grant: AuthorizationGrantView = { id: 'grant-a', principalType: 'owner', principalId: 'owner', agentId: 'agent-a', origin: 'admin', actions: ['content:apply'], resourceScope: { kind: 'content', ids: ['post-a'] }, expiresAt: input.expiresAt, runLimit: 1, usageLimit: 1000, revision: 1, revokedAt: null };
const request = { origin: 'admin' as const, principalType: 'owner', principalId: 'owner', agentId: 'agent-a', action: 'content:apply' as const, resourceKind: 'content' as const, resourceId: 'post-a', now: Date.parse('2026-09-22T00:00:00Z') };
describe('事项授权默认拒绝', () => {
  it('模板不自动增加发布动作；L2 单次、L3 仅提醒，未知来源与字段拒绝', () => {
    expect(parseGrantInput(input)?.actions).toEqual(['content:apply']);
    for (const changed of [{ origin: 'admin' }, { principalId: 'other' }, { runLimit: 2 }, { resourceScope: { kind: 'content', ids: ['*'] } }, { level: 'L3' }]) expect(parseGrantInput({ ...input, ...changed })).toBeNull();
    expect(parseGrantInput({ ...input, level: 'L3', runLimit: 20, actions: ['reminder:scan'], resourceScope: { kind: 'reminder', ids: ['weekly'] } })).not.toBeNull();
  });
  it('撤销、到期、换身份/Agent/对象/动作、公开来源不能使用后台授权', () => {
    expect(grantAllows(grant, request)).toBe(true);
    expect(grantAllows(null, request)).toBe(false);
    for (const change of [{ origin: 'public' as const }, { principalId: 'visitor' }, { agentId: 'other' }, { resourceId: 'post-b' }, { action: 'content:publish' as const }, { now: Date.parse(input.expiresAt) }]) expect(grantAllows(grant, { ...request, ...change })).toBe(false);
    expect(grantAllows({ ...grant, revokedAt: '2026-09-22T00:00:00Z' }, request)).toBe(false);
  });
});

describe('授权可用性判定（唯一判据，含额度）', () => {
  const runGrant: AuthorizationGrantView = { ...grant, actions: ['agent:run'], resourceScope: { kind: 'agent', ids: ['agent-a'] } };
  const runRequest = { ...request, action: 'agent:run' as const, resourceKind: 'agent' as const, resourceId: 'agent-a' };
  const withUsage = (runsCharged: number, runsReserved = 0, usageCharged = 0) =>
    ({ ...runGrant, runsReserved, runsCharged, usageReserved: 0, usageCharged });

  it('剩余额度用完后不可用——只看 runLimit 会误判为可用（本次故障的判据）', () => {
    expect(grantUsable(runGrant, runRequest)).toEqual({ usable: true });
    expect(grantRemaining(runGrant)).toEqual({ runs: 1, usage: 1000 });
    expect(grantUsable(withUsage(1), runRequest)).toEqual({ usable: false, reason: 'run-limit-exhausted' });
    expect(grantRemaining(withUsage(1, 0, 300))).toEqual({ runs: 0, usage: 700 });
  });

  it('权限判定与额度判定分开：额度用尽不是「没权限」，执行准入语义不被读侧悄悄改掉', () => {
    // grantAllows 回答「准不准做这件事」，与剩余额度无关——额度由存储层的原子 reserve
    // 把关（它才是并发下的权威）。读侧额外拒绝会把「额度已用完，已改为规则处理」
    // 换成笼统的 403，那是另一套产品语义。
    expect(grantAllows(withUsage(9), runRequest)).toBe(true);
    expect(grantUsable(withUsage(9), runRequest)).toEqual({ usable: false, reason: 'run-limit-exhausted' });
    expect(grantAllows({ ...runGrant, revokedAt: '2026-09-22T00:00:00Z' }, runRequest)).toBe(false);
  });

  it('预留中的额度也算已占用，不重复放行', () => {
    expect(grantRemaining(withUsage(0, 1))).toEqual({ runs: 0, usage: 1000 });
    expect(grantUsable(withUsage(0, 1), runRequest)).toEqual({ usable: false, reason: 'run-limit-exhausted' });
  });

  it('token 额度用尽同样拒绝，并给出独立原因', () => {
    expect(grantUsable(withUsage(0, 0, 1000), runRequest)).toEqual({ usable: false, reason: 'usage-limit-exhausted' });
  });

  it('挑授权：先用最快到期的那条，不让旧额度闲置到作废；挑不中返回 null 不签发', () => {
    const later = { ...withUsage(0), id: 'grant-later', expiresAt: '2027-01-01T00:00:00.000Z' };
    const sooner = { ...withUsage(0), id: 'grant-sooner', expiresAt: '2026-10-30T00:00:00.000Z' };
    const dead = { ...withUsage(9), id: 'grant-dead', expiresAt: '2026-10-20T00:00:00.000Z' };
    // 传入顺序故意把「后到期」放前面：结果必须仍按到期时间挑
    expect(pickUsableGrant([later, sooner, dead], runRequest)?.id).toBe('grant-sooner');
    expect(pickUsableGrant([later, dead], runRequest)?.id).toBe('grant-later');
    expect(pickUsableGrant([dead], runRequest)).toBeNull();
    expect(pickUsableGrant([], runRequest)).toBeNull();
  });

  it('每一类拒绝都有独立原因，调用方据此给下一步', () => {
    expect(grantUsable(null, runRequest)).toEqual({ usable: false, reason: 'revoked' });
    expect(grantUsable(runGrant, { ...runRequest, origin: 'public' })).toEqual({ usable: false, reason: 'public-origin' });
    expect(grantUsable(runGrant, { ...runRequest, principalId: 'other' })).toEqual({ usable: false, reason: 'identity-mismatch' });
    expect(grantUsable(runGrant, { ...runRequest, agentId: 'agent-b' })).toEqual({ usable: false, reason: 'agent-mismatch' });
    expect(grantUsable({ ...runGrant, revokedAt: '2026-09-22T00:00:00Z' }, runRequest)).toEqual({ usable: false, reason: 'revoked' });
    expect(grantUsable(runGrant, { ...runRequest, now: Date.parse(input.expiresAt) })).toEqual({ usable: false, reason: 'expired' });
    expect(grantUsable({ ...runGrant, runLimit: null }, runRequest)).toEqual({ usable: false, reason: 'no-limits' });
    expect(grantUsable({ ...runGrant, actions: ['content:read'] }, runRequest)).toEqual({ usable: false, reason: 'action-not-granted' });
    expect(grantUsable(runGrant, { ...runRequest, resourceId: 'other' })).toEqual({ usable: false, reason: 'scope-mismatch' });
    expect(grantUsable({ ...runGrant, origin: 'system' }, runRequest)).toEqual({ usable: false, reason: 'origin-not-allowed' });
  });
});
