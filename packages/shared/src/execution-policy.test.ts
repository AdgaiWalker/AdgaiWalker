import { expect, it } from 'vitest';
import { executionPolicyAllows, type ExecutionPolicyInput } from './execution-policy';
const base: ExecutionPolicyInput = { origin: 'public', principalType: 'visitor', principalId: 'visitor-a', agentId: 'agent-a', action: 'content:read', resourceKind: 'content', resourceId: 'post-a', now: Date.now(), agentActions: ['content:read'], objectActions: ['content:read'], grant: null };
it('来源、Agent 与对象策略取交集，未知策略拒绝', () => {
  expect(executionPolicyAllows(base)).toBe(true);
  for (const patch of [{ agentActions: null }, { objectActions: [] }, { principalType: 'owner' }, { action: 'content:apply' as const }]) expect(executionPolicyAllows({ ...base, ...patch })).toBe(false);
});
it('子任务不能扩大来源、对象、动作或更换归属', () => {
  const child = { ...base, parent: { origin: 'public' as const, principalId: base.principalId, actions: ['content:read'] as const, scope: { kind: 'content' as const, ids: ['post-a'] }, grantId: null } };
  expect(executionPolicyAllows(child)).toBe(true);
  for (const patch of [{ origin: 'admin' as const }, { resourceId: 'post-b' }, { principalId: 'visitor-b' }]) expect(executionPolicyAllows({ ...child, ...patch })).toBe(false);
});
