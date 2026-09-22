import { describe, expect, it } from 'vitest';
import { grantAllows, parseGrantInput, type AuthorizationGrantView } from './authorization';
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
