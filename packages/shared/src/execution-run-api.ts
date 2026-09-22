import { parseExecutionSubmit, type ExecutionSubmit, type RunOrigin, type RunState, type RunStopReason } from './agent-execution.js';
import { isRecord } from './guards.js';

/** 后台运行接口只接受任务意图和授权编号。来源与主体由控制器填入。 */
export interface ExecutionRunRequest {
  grantId: string;
  submit: ExecutionSubmit;
}

export function parseExecutionRunRequest(value: unknown): ExecutionRunRequest | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.some((key) => !['idempotencyKey', 'kind', 'agentRevisionId', 'input', 'targetId', 'grantId'].includes(key))) return null;
  if (typeof value.grantId !== 'string' || !/^[a-f0-9]{64}$/.test(value.grantId)) return null;
  const submit = parseExecutionSubmit({
    requestKey: value.idempotencyKey,
    kind: value.kind,
    agentRevisionId: value.agentRevisionId,
    input: value.input,
    ...(value.targetId === undefined ? {} : { targetId: value.targetId }),
  });
  return submit ? { grantId: value.grantId, submit } : null;
}

export function parseRunCursor(value: string | undefined): string | null {
  if (value === undefined || value === '') return null;
  return /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : 'invalid';
}

export function parseEventCursor(value: string | undefined): number | null {
  if (value === undefined || value === '') return 0;
  if (!/^\d+$/.test(value)) return null;
  const seq = Number(value);
  return Number.isSafeInteger(seq) && seq >= 0 && seq <= 1_000_000 ? seq : null;
}

export interface ExecutionRunView {
  id: string;
  state: RunState;
  kind: string;
  origin: RunOrigin;
  actor: string;
  agentRevisionId: string | null;
  grantId: string | null;
  idempotencyKey: string;
  input: string | null;
  stopReason: RunStopReason | null;
  tokensIn: number | null;
  tokensOut: number | null;
  elapsedMs: number | null;
  deadline: string | null;
  createdAt: string;
}

export interface ExecutionRunListItem extends ExecutionRunView {
  agentId: string | null;
  agentName: string | null;
}

export interface ExecutionEventView {
  seq: number;
  kind: 'text' | 'usage';
  text: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
}
