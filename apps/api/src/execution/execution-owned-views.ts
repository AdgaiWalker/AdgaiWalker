import {
  isSafeAgentId,
  parseEventCursor,
  parseRunCursor,
  type ExecutionEventView,
  type ExecutionRunListItem,
  type ExecutionRunView,
} from '@walker/shared';
import { ApiError, validationError } from '../common/http-error';
import type { AgentExecutionRecord, AgentExecutionRepositoryPort } from '../ports/agent-execution.repository';

export const OWNED_RUN_MAX_LIMIT = 50;
export const OWNED_EVENT_PAGE_SIZE = 50;
export const OWNED_STREAM_MAX_MS = 130_000;
export const OWNED_STREAM_POLL_MS = 200;

/** 运行终态的只读快照。等待实现与调用方之间的唯一交换格式，不泄漏存储行。 */
export interface ExecutionRunOutcome {
  runId: string;
  state: 'QUEUED' | 'CLAIMED' | 'RUNNING' | 'STOPPING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'UNKNOWN';
  /** 非成功终态的原因（quota / deadline / runtime-error / user ...） */
  stopReason: string | null;
  success: boolean;
  elapsedMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

export function outcomeOf(run: AgentExecutionRecord): ExecutionRunOutcome {
  const state = run.state as ExecutionRunOutcome['state'];
  return {
    runId: run.id,
    state,
    stopReason: run.stopReason,
    success: state === 'SUCCEEDED',
    elapsedMs: run.elapsedMs,
    tokensIn: run.tokensIn,
    tokensOut: run.tokensOut,
  };
}

const DEFAULT_TERMINAL_DEADLINE_MS = 120_000;
const TERMINAL_POLL_MS = 250;
const TERMINAL_GRACE_MS = 5_000;
const isTerminalExecutionState = (state: string) =>
  state === 'SUCCEEDED' || state === 'FAILED' || state === 'CANCELLED' || state === 'UNKNOWN';

/** 等一条运行抵达终态——唯一一份等待实现（跟随运行自身的 deadline）。 */
export async function awaitExecutionTerminal(
  runs: Pick<AgentExecutionRepositoryPort, 'findById'>,
  runId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ExecutionRunOutcome | null> {
  let run = await runs.findById(runId);
  if (!run) return null;
  if (isTerminalExecutionState(run.state)) return outcomeOf(run);
  const until = (run.deadline ? run.deadline.getTime() : Date.now() + DEFAULT_TERMINAL_DEADLINE_MS) + TERMINAL_GRACE_MS;
  while (Date.now() < until) {
    if (options.signal?.aborted) return outcomeOf(run);
    await new Promise((resolve) => setTimeout(resolve, TERMINAL_POLL_MS));
    run = await runs.findById(runId);
    if (!run) return null;
    if (isTerminalExecutionState(run.state)) return outcomeOf(run);
  }
  return outcomeOf(run);
}

export function viewOf(run: AgentExecutionRecord): ExecutionRunView {
  return {
    id: run.id,
    state: run.state,
    kind: run.kind,
    origin: run.origin,
    actor: run.actor,
    agentRevisionId: run.agentRevisionId,
    grantId: run.grantId ?? null,
    idempotencyKey: run.requestKey,
    input: run.input,
    stopReason: run.stopReason,
    tokensIn: run.tokensIn,
    tokensOut: run.tokensOut,
    elapsedMs: run.elapsedMs,
    deadline: run.deadline ? run.deadline.toISOString() : null,
    createdAt: run.createdAt.toISOString(),
  };
}

export function isOwnedRun(run: AgentExecutionRecord): boolean {
  return run.origin === 'admin' && run.actor === 'owner';
}

export async function loadOwnedView(
  runs: Pick<AgentExecutionRepositoryPort, 'findById'>,
  id: string,
): Promise<ExecutionRunView> {
  const run = await runs.findById(id);
  if (!run || !isOwnedRun(run)) throw new ApiError('run-not-found', 404, '找不到这条运行记录');
  return viewOf(run);
}

export async function listOwnedRuns(
  runs: Pick<AgentExecutionRepositoryPort, 'findById' | 'listOwned' | 'countOwned'>,
  cursor: string | undefined,
  limit = 20,
  agentId?: string,
): Promise<{ items: ExecutionRunListItem[]; next: string | null; total: number }> {
  const parsed = parseRunCursor(cursor);
  if (
    parsed === 'invalid' ||
    (agentId !== undefined && !isSafeAgentId(agentId)) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > OWNED_RUN_MAX_LIMIT
  ) {
    throw validationError('游标或数量不正确');
  }
  const before = parsed ? await runs.findById(parsed) : null;
  if (parsed && (!before || !isOwnedRun(before))) throw validationError('游标或数量不正确');
  const [rows, total] = await Promise.all([
    runs.listOwned({
      origin: 'admin',
      actor: 'owner',
      agentId,
      before: before ? { createdAt: before.createdAt, id: before.id } : null,
      limit,
    }),
    runs.countOwned(agentId),
  ]);
  return {
    items: rows.map((row) => ({ ...viewOf(row), agentId: row.agentId, agentName: row.agentName })),
    next: rows.length === limit ? rows[rows.length - 1].id : null,
    total,
  };
}

export async function listOwnedEvents(
  runs: Pick<AgentExecutionRepositoryPort, 'findById' | 'listEvents'>,
  id: string,
  after: string | undefined,
): Promise<{ items: ExecutionEventView[]; next: number | null }> {
  await loadOwnedView(runs, id);
  const seq = parseEventCursor(after);
  if (seq === null) throw validationError('事件游标不正确');
  const rows = await runs.listEvents(id, seq, OWNED_EVENT_PAGE_SIZE);
  return {
    items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    next: rows.length === OWNED_EVENT_PAGE_SIZE ? rows[rows.length - 1].seq : null,
  };
}

/**
 * 把已保存的文本事件按助手 SSE 的 text/done 帧写出。
 * 连接断开只停止观察，不停止运行。
 */
export async function streamOwnedRun(
  runs: Pick<AgentExecutionRepositoryPort, 'findById' | 'listEvents'>,
  id: string,
  signal: AbortSignal,
  write: (chunk: string) => void,
): Promise<void> {
  await loadOwnedView(runs, id);
  let after = 0;
  let text = '';
  const started = Date.now();
  while (!signal.aborted && Date.now() - started < OWNED_STREAM_MAX_MS) {
    const events = await runs.listEvents(id, after, OWNED_EVENT_PAGE_SIZE);
    for (const event of events) {
      after = event.seq;
      if (event.kind !== 'text' || !event.text) continue;
      text += event.text;
      write(`event: text\ndata: ${JSON.stringify({ delta: event.text })}\n\n`);
    }
    const run = await loadOwnedView(runs, id);
    if (run.state === 'SUCCEEDED' || run.state === 'FAILED' || run.state === 'CANCELLED') {
      const event = run.state === 'SUCCEEDED' ? 'done' : 'error';
      const data = run.state === 'SUCCEEDED' ? { answer: text } : { state: run.state, stopReason: run.stopReason };
      write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, OWNED_STREAM_POLL_MS));
  }
}
