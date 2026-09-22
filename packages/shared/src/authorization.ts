import { isRecord } from './guards.js';
import { AGENT_ACTIONS, originAllowsAction, type AgentAction, type ResourceScope, type RunOrigin } from './agent-execution.js';

export type GrantLevel = 'L0' | 'L1' | 'L2' | 'L3';
export interface GrantInput {
  requestKey: string; level: GrantLevel; agentId: string; actions: AgentAction[];
  resourceScope: ResourceScope; expiresAt: string; runLimit: number; usageLimit: number;
}
export interface AuthorizationGrantView {
  id: string; principalType: string; principalId: string; agentId: string | null; origin: RunOrigin;
  actions: AgentAction[]; resourceScope: ResourceScope; expiresAt: string | null;
  runLimit: number | null; usageLimit: number | null; revision: number; revokedAt: string | null;
}
const LEVEL_ACTIONS: Record<GrantLevel, readonly AgentAction[]> = {
  L0: ['content:read', 'agent:run'],
  L1: ['content:read', 'agent:run', 'content:propose'],
  L2: ['content:read', 'agent:run', 'content:propose', 'content:approve', 'content:apply', 'content:publish'],
  L3: ['reminder:scan'],
};
export function parseGrantInput(raw: unknown): GrantInput | null {
  if (!isRecord(raw) || Object.keys(raw).some((key) => !['requestKey', 'level', 'agentId', 'actions', 'resourceScope', 'expiresAt', 'runLimit', 'usageLimit'].includes(key))) return null;
  if (typeof raw.requestKey !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(raw.requestKey)) return null;
  if (typeof raw.level !== 'string' || !Object.hasOwn(LEVEL_ACTIONS, raw.level)) return null;
  const level = raw.level as GrantLevel;
  if (typeof raw.agentId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(raw.agentId)) return null;
  if (!Array.isArray(raw.actions) || !raw.actions.length || raw.actions.length > AGENT_ACTIONS.length || new Set(raw.actions).size !== raw.actions.length || raw.actions.some((action) => !LEVEL_ACTIONS[level].includes(action))) return null;
  const scope = raw.resourceScope;
  if (!isRecord(scope) || Object.keys(scope).some((key) => !['kind', 'ids'].includes(key)) || !['agent', 'content', 'placement', 'reminder'].includes(String(scope.kind))) return null;
  if (!Array.isArray(scope.ids) || !scope.ids.length || scope.ids.length > 100 || scope.ids.some((id) => typeof id !== 'string' || !/^[a-zA-Z0-9_/-]{1,200}$/.test(id) || id.includes('..')) || new Set(scope.ids).size !== scope.ids.length) return null;
  if (level === 'L3' && scope.kind !== 'reminder') return null;
  if (raw.actions.some((action: string) => action.startsWith('content:')) && scope.kind !== 'content') return null;
  if (raw.actions.includes('reminder:scan') && scope.kind !== 'reminder') return null;
  if (typeof raw.expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(raw.expiresAt) || !Number.isFinite(Date.parse(raw.expiresAt))) return null;
  if (!Number.isSafeInteger(raw.runLimit) || (raw.runLimit as number) < 1 || (raw.runLimit as number) > 10000 || (level === 'L2' && raw.runLimit !== 1)) return null;
  if (!Number.isSafeInteger(raw.usageLimit) || (raw.usageLimit as number) < 1 || (raw.usageLimit as number) > 10_000_000) return null;
  return { requestKey: raw.requestKey, level, agentId: raw.agentId, actions: [...raw.actions], resourceScope: { kind: scope.kind as ResourceScope['kind'], ids: [...scope.ids] }, expiresAt: new Date(raw.expiresAt).toISOString(), runLimit: raw.runLimit as number, usageLimit: raw.usageLimit as number };
}

/** 调用点必须提供可信身份；授权存在不等于已经预留配额。 */
export function grantAllows(grant: AuthorizationGrantView | null, request: {
  origin: RunOrigin; principalType: string; principalId: string; agentId: string;
  action: AgentAction; resourceKind: ResourceScope['kind']; resourceId: string; now: number;
}): boolean {
  if (!grant || request.origin === 'public' || !originAllowsAction(request.origin, request.action)) return false;
  return grant.origin === request.origin && grant.principalType === request.principalType && grant.principalId === request.principalId && grant.agentId === request.agentId &&
    grant.revokedAt === null && grant.expiresAt !== null && Date.parse(grant.expiresAt) > request.now &&
    grant.runLimit !== null && grant.runLimit > 0 && grant.usageLimit !== null && grant.usageLimit > 0 &&
    grant.actions.includes(request.action) && grant.resourceScope.kind === request.resourceKind && grant.resourceScope.ids.includes(request.resourceId);
}
