import { originAllowsAction, type AgentAction, type ResourceScope, type RunOrigin } from './agent-execution.js';
import { grantAllows, type AuthorizationGrantView } from './authorization.js';

export interface ExecutionPolicyInput {
  origin: RunOrigin; principalType: string; principalId: string; agentId: string;
  action: AgentAction; resourceKind: ResourceScope['kind']; resourceId: string; now: number;
  agentActions: readonly AgentAction[] | null; objectActions: readonly AgentAction[] | null;
  grant: AuthorizationGrantView | null;
  parent?: { origin: RunOrigin; principalId: string; actions: readonly AgentAction[]; scope: ResourceScope; grantId: string | null };
}
/** 所有上限取交集；缺少任一策略拒绝。来源只能保持或收窄为 public。 */
export function executionPolicyAllows(input: ExecutionPolicyInput): boolean {
  if (!input.principalId || !originAllowsAction(input.origin, input.action) ||
      !input.agentActions?.includes(input.action) || !input.objectActions?.includes(input.action)) return false;
  if (input.parent) {
    const parent = input.parent;
    if (input.origin !== parent.origin && input.origin !== 'public') return false;
    if (input.principalId !== parent.principalId || !parent.actions.includes(input.action) ||
        parent.scope.kind !== input.resourceKind || !parent.scope.ids.includes(input.resourceId) ||
        (input.grant?.id ?? null) !== parent.grantId) return false;
  }
  if (input.origin === 'public') return input.principalType === 'visitor' && input.grant === null;
  return grantAllows(input.grant, input);
}
