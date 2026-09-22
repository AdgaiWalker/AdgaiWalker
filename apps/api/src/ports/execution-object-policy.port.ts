import type { AgentAction, ResourceScope } from '@walker/shared';
export const EXECUTION_OBJECT_POLICY = Symbol('EXECUTION_OBJECT_POLICY');
export interface ExecutionObjectPolicyPort {
  actions(kind: ResourceScope['kind'], id: string, agentId: string): Promise<readonly AgentAction[]>;
}
