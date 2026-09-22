import { isRecord } from './guards.js';

/** 新执行入口的共享合同。origin 与 actor 只由可信服务端构造。 */
export const RUN_ORIGINS = ['public', 'admin', 'system'] as const;
export type RunOrigin = typeof RUN_ORIGINS[number];

export const RUN_STATES = [
  'QUEUED', 'CLAIMED', 'RUNNING', 'STOPPING', 'UNKNOWN',
  'SUCCEEDED', 'FAILED', 'CANCELLED',
] as const;
export type RunState = typeof RUN_STATES[number];

export const RUN_STOP_REASONS = [
  'user', 'deadline', 'quota', 'shutdown', 'lease-lost', 'runtime-error',
] as const;
export type RunStopReason = typeof RUN_STOP_REASONS[number];

export const AGENT_ACTIONS = [
  'content:read', 'agent:run', 'content:propose', 'content:approve',
  'content:apply', 'content:publish', 'reminder:scan',
] as const;
export type AgentAction = typeof AGENT_ACTIONS[number];

export type ResourceScope = {
  kind: 'agent' | 'content' | 'placement' | 'reminder';
  ids: string[];
};

export type AgentConfigHash = string;
export function isAgentConfigHash(value: unknown): value is AgentConfigHash {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function isRunTerminal(state: RunState): boolean {
  return state === 'SUCCEEDED' || state === 'FAILED' || state === 'CANCELLED';
}

const TRANSITIONS: Record<RunState, readonly RunState[]> = {
  QUEUED: ['CLAIMED', 'CANCELLED', 'FAILED'],
  CLAIMED: ['RUNNING', 'STOPPING', 'UNKNOWN', 'FAILED'],
  RUNNING: ['STOPPING', 'UNKNOWN', 'SUCCEEDED', 'FAILED'],
  STOPPING: ['UNKNOWN', 'CANCELLED', 'FAILED'],
  UNKNOWN: ['CANCELLED', 'FAILED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionRun(from: RunState, to: RunState): boolean {
  return Object.hasOwn(TRANSITIONS, from) && TRANSITIONS[from].includes(to);
}

/** 人工取消与截止时间确认终止后的终态。关闭未完成前不能用这个结果释放槽。 */
export function stopOutcome(cause: 'user' | 'deadline'): { state: 'CANCELLED' | 'FAILED'; stopReason: 'user' | 'deadline' } {
  return cause === 'user'
    ? { state: 'CANCELLED', stopReason: 'user' }
    : { state: 'FAILED', stopReason: 'deadline' };
}

/** 公开来源的不可升级上限。更细的授权交集由 R09 实现。 */
export function originAllowsAction(origin: RunOrigin, action: AgentAction): boolean {
  if (!AGENT_ACTIONS.includes(action)) return false;
  if (origin === 'public') return action === 'content:read' || action === 'agent:run';
  if (origin === 'system') return action === 'content:read' || action === 'reminder:scan';
  return origin === 'admin';
}

export const RUN_KINDS = ['chat', 'test', 'compare', 'file', 'workstation'] as const;
export type RunKind = typeof RUN_KINDS[number];

/** 请求体只表达任务意图；幂等域、origin、actor、授权由控制器/用例确定。 */
export type ExecutionSubmit = {
  requestKey: string;
  kind: RunKind;
  agentRevisionId: string;
  input: string;
  targetId?: string;
};

export function parseExecutionSubmit(value: unknown): ExecutionSubmit | null {
  if (!isRecord(value)) return null;
  const body = value;
  const keys = Object.keys(body);
  if (keys.some((key) => !['requestKey', 'kind', 'agentRevisionId', 'input', 'targetId'].includes(key))) return null;
  if (typeof body.requestKey !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(body.requestKey)) return null;
  if (typeof body.kind !== 'string' || !RUN_KINDS.includes(body.kind as RunKind)) return null;
  if (typeof body.agentRevisionId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.agentRevisionId)) return null;
  if (typeof body.input !== 'string' || !body.input.trim() || body.input.length > 20_000) return null;
  if (body.targetId !== undefined && (typeof body.targetId !== 'string' || !/^[a-zA-Z0-9_/-]{1,200}$/.test(body.targetId))) return null;
  return {
    requestKey: body.requestKey,
    kind: body.kind as RunKind,
    agentRevisionId: body.agentRevisionId,
    input: body.input,
    ...(body.targetId === undefined ? {} : { targetId: body.targetId as string }),
  };
}
