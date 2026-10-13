import { isRecord } from './guards.js';
import { AGENT_ACTIONS, originAllowsAction, type AgentAction, type ResourceScope, type RunOrigin } from './agent-execution.js';

export type GrantLevel = 'L0' | 'L1' | 'L2' | 'L3';
export interface GrantInput {
  requestKey: string; level: GrantLevel; agentId: string; actions: AgentAction[];
  resourceScope: ResourceScope; expiresAt: string; runLimit: number; usageLimit: number;
}
/** 签发视图：一次授权的事实。**不含已用量**——已用量由存储层计数器持有。 */
export interface AuthorizationGrantView {
  id: string; principalType: string; principalId: string; agentId: string | null; origin: RunOrigin;
  actions: AgentAction[]; resourceScope: ResourceScope; expiresAt: string | null;
  runLimit: number | null; usageLimit: number | null; revision: number; revokedAt: string | null;
}

/** 授权的累计用量（次数与 token 分开记）。唯一写入方是存储层计数器，调用方不得自行推算。 */
export interface AuthorizationGrantUsage {
  runsReserved: number;
  runsCharged: number;
  usageReserved: number;
  usageCharged: number;
}

/**
 * 读视图：事实 + 已用量。
 *
 * **判断一条授权现在还能不能跑，必须用这个类型**——只看 runLimit 会得出「还有额度」的
 * 错误结论。实测就是这样把三条已经用满的授权当成可用授权，反复拿去空跑。
 */
export interface AuthorizationGrantState extends AuthorizationGrantView, AuthorizationGrantUsage {}

/** 权限层面不成立的原因。调用方据此给出可执行的下一步，而不是笼统的 403。 */
export type GrantDenialReason =
  | 'public-origin'
  | 'origin-not-allowed'
  | 'identity-mismatch'
  | 'agent-mismatch'
  | 'revoked'
  | 'expired'
  | 'no-limits'
  | 'action-not-granted'
  | 'scope-mismatch';

/** "现在能不能拿去跑"的完整原因：权限原因 + 额度原因。 */
export type GrantUnusableReason = GrantDenialReason | 'run-limit-exhausted' | 'usage-limit-exhausted';

export interface GrantAvailabilityRequest {
  origin: RunOrigin; principalType: string; principalId: string; agentId: string;
  action: AgentAction; resourceKind: ResourceScope['kind']; resourceId: string; now: number;
}

export type GrantAvailability = { usable: true } | { usable: false; reason: GrantUnusableReason };

/** 已用量：缺失（签发视图）按 0 计——真实调用路径读到的永远是带计数器的读视图。 */
function usageOf(grant: AuthorizationGrantView): AuthorizationGrantUsage {
  const state = grant as Partial<AuthorizationGrantUsage>;
  return {
    runsReserved: state.runsReserved ?? 0,
    runsCharged: state.runsCharged ?? 0,
    usageReserved: state.usageReserved ?? 0,
    usageCharged: state.usageCharged ?? 0,
  };
}

/** 剩余额度。`null` 表示「没设上限」，与 0 区分——0 是用完，null 是没设。 */
export function grantRemaining(grant: AuthorizationGrantView): { runs: number | null; usage: number | null } {
  const used = usageOf(grant);
  return {
    runs: grant.runLimit === null ? null : Math.max(grant.runLimit - used.runsReserved - used.runsCharged, 0),
    usage: grant.usageLimit === null ? null : Math.max(grant.usageLimit - used.usageReserved - used.usageCharged, 0),
  };
}

function expiryOf(grant: AuthorizationGrantView): number {
  return grant.expiresAt === null ? Number.POSITIVE_INFINITY : Date.parse(grant.expiresAt);
}

/**
 * 从候选里挑一条现在能跑的——**选择顺序也只有这里一份**。
 *
 * 先用**最快到期**的那条：额度是不可续的消耗品，先挑新签的会让旧授权一直闲置到作废。
 * 同到期时间保持传入顺序（`Array.prototype.sort` 稳定），调用方给的顺序就是它的兜底。
 * 挑不中返回 null——**本函数不签发**，签发是要进审计的独立动作。
 */
export function pickUsableGrant<T extends AuthorizationGrantView>(
  grants: readonly T[],
  request: GrantAvailabilityRequest,
): T | null {
  const usable = grants.filter((grant) => grantUsable(grant, request).usable);
  if (usable.length === 0) return null;
  return [...usable].sort((a, b) => expiryOf(a) - expiryOf(b))[0]!;
}

/**
 * 权限判定的**唯一实现**：身份、来源、动作、范围、撤销、到期。
 *
 * **不含额度**——额度是"还剩几次"的状态，不是"准不准做"的权限，而且读侧判断天生
 * 有竞态。并发下的额度把关交给存储层的原子实现（`reserve` 的 UPDATE … WHERE），
 * 那条 UPDATE 才是权威。这条边界划清楚，执行准入的语义就不会被读侧检查悄悄改掉。
 *
 * 返回 null 表示有权限；否则返回第一个不成立的原因。
 */
export function grantDenial(
  grant: AuthorizationGrantView | null,
  request: GrantAvailabilityRequest,
): GrantDenialReason | null {
  if (!grant) return 'revoked';
  if (request.origin === 'public') return 'public-origin';
  if (grant.origin !== request.origin) return 'origin-not-allowed';
  if (!originAllowsAction(request.origin, request.action)) return 'origin-not-allowed';
  if (grant.principalType !== request.principalType || grant.principalId !== request.principalId) return 'identity-mismatch';
  if (grant.agentId !== request.agentId) return 'agent-mismatch';
  if (grant.revokedAt !== null) return 'revoked';
  if (grant.expiresAt === null || Date.parse(grant.expiresAt) <= request.now) return 'expired';
  if (grant.runLimit === null || grant.runLimit <= 0 || grant.usageLimit === null || grant.usageLimit <= 0) return 'no-limits';
  if (!grant.actions.includes(request.action)) return 'action-not-granted';
  if (grant.resourceScope.kind !== request.resourceKind || !grant.resourceScope.ids.includes(request.resourceId)) return 'scope-mismatch';
  return null;
}

/**
 * 这条授权**现在**能不能拿去跑：权限 + 剩余额度。
 *
 * 用于"选一条授权来用"（直调、试跑面板、发布测试），不用于执行准入——
 * 准入只看权限，额度由 reserve 原子把关，两者职责不同不要互相替代。
 */
export function grantUsable(
  grant: AuthorizationGrantView | null,
  request: GrantAvailabilityRequest,
): GrantAvailability {
  const denial = grantDenial(grant, request);
  if (denial) return { usable: false, reason: denial };
  const remaining = grantRemaining(grant!);
  if (remaining.runs === 0) return { usable: false, reason: 'run-limit-exhausted' };
  if (remaining.usage === 0) return { usable: false, reason: 'usage-limit-exhausted' };
  return { usable: true };
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

/** 调用点必须提供可信身份；授权存在不等于已经预留配额（额度由 reserve 原子把关）。 */
export function grantAllows(grant: AuthorizationGrantView | null, request: GrantAvailabilityRequest): boolean {
  return grantDenial(grant, request) === null;
}
