import { ASSISTANT_ANSWER_MIN_LENGTH, extractStreamedAnswer } from '@walker/shared';
import type { AgentExecutionRecord, AgentExecutionRepositoryPort } from '../ports/agent-execution.repository';
import type { ExecutionContext } from './execution-admission';
import type { StopCause, StopResult } from './execution-lifecycle';
import {
  publicActorScope,
  PublicRuntimeContextStore,
  type PublicRuntimeContext,
} from './execution-runtime-context';

export type { PublicRuntimeContext };

export const MAX_PUBLIC_EXECUTION_OUTPUT_CHARS = 24_000;
export const PUBLIC_RUN_POLL_MS = 80;
export const PUBLIC_EVENT_PAGE_SIZE = 50;

export type EnqueueResult =
  | { outcome: 'queued'; runId: string }
  | { outcome: 'degraded'; reason: string };

export type DispatchResult =
  | { outcome: 'started'; runId: string }
  | { outcome: 'waiting' }
  | { outcome: 'idle' }
  | { outcome: 'degraded'; runId: string | null; reason: string }
  | { outcome: 'rejected'; runId: string; reason: string };

export type PublicChatExecutionResult =
  | {
      outcome: 'completed';
      runId: string;
      output: string;
      /** 到预算上限时交付的未写完回答：已经生成的部分是真的，不许丢 */
      partial?: boolean;
      sessionId: string | null;
      tokensIn: number | null;
      tokensOut: number | null;
      elapsedMs: number | null;
    }
  | {
      outcome: 'degraded';
      reason: 'queue-full' | 'queue-deadline' | 'budget-exceeded' | 'timeout' | 'client-abort' | 'user-stopped' | 'runtime-error';
    };

export interface PublicChatRunInput {
  principalId: string;
  runtimeVisitorKey: string;
  agentId: string;
  agentRevisionId: string;
  requestKey: string;
  targetSlug: string;
  prompt: string;
  placementKey: string;
  deploymentId: string;
  deploymentGeneration: number;
  contentSnapshotId: string;
  conversationId?: string | null;
  runtimeSessionId?: string | null;
  freshPrompt?: string;
  deadlineAt: Date;
  onQueued?: (runId: string) => void | Promise<void>;
  signal?: AbortSignal;
  onText?: (text: string) => void;
}

/**
 * 公共问答的队列执行与流式等待桥接：固定 public/visitor/chat，
 * 在统一持久队列中排队、启动并在截止前流式推送已生成正文。
 */
export async function runPublicChatExecution(
  deps: {
    runs: Pick<AgentExecutionRepositoryPort, 'listEvents' | 'findById'>;
    publicRuntimeContexts: PublicRuntimeContextStore;
    enqueue: (raw: unknown, context: ExecutionContext, options?: { deadline?: Date | null }) => Promise<EnqueueResult>;
    dispatch: () => Promise<DispatchResult>;
    follow: (runId: string) => void;
    stop: (runId: string, cause: StopCause) => Promise<StopResult>;
  },
  input: PublicChatRunInput,
): Promise<PublicChatExecutionResult> {
  if (input.signal?.aborted) return { outcome: 'degraded', reason: 'client-abort' };
  const context: ExecutionContext = {
    origin: 'public',
    principalType: 'visitor',
    principalId: input.principalId,
    agentId: input.agentId,
    grantId: null,
    placementKey: input.placementKey,
    deploymentId: input.deploymentId,
    deploymentGeneration: input.deploymentGeneration,
    contentSnapshotId: input.contentSnapshotId,
    conversationId: input.conversationId ?? null,
  };
  const actorScope = publicActorScope(input.principalId);
  const requestKey = input.requestKey;
  deps.publicRuntimeContexts.set(actorScope, requestKey, {
    visitorKey: input.runtimeVisitorKey,
    sessionId: input.runtimeSessionId ?? null,
    freshPrompt: input.freshPrompt,
    resultSessionId: null,
    conversationId: input.conversationId ?? null,
  });

  let queued: EnqueueResult;
  try {
    queued = await deps.enqueue(
      {
        requestKey: input.requestKey,
        kind: 'chat',
        agentRevisionId: input.agentRevisionId,
        targetId: input.targetSlug,
        input: input.prompt,
      },
      context,
      { deadline: input.deadlineAt },
    );
  } catch {
    deps.publicRuntimeContexts.delete(actorScope, requestKey);
    return { outcome: 'degraded', reason: 'runtime-error' };
  }
  if (queued.outcome === 'degraded') {
    deps.publicRuntimeContexts.delete(actorScope, requestKey);
    return {
      outcome: 'degraded',
      reason: queued.reason.includes('截止') ? 'queue-deadline' : 'queue-full',
    };
  }
  try {
    await input.onQueued?.(queued.runId);
  } catch {
    void deps.stop(queued.runId, 'deadline').catch(() => undefined);
    deps.publicRuntimeContexts.delete(actorScope, requestKey);
    return { outcome: 'degraded', reason: 'runtime-error' };
  }

  let dispatched: DispatchResult;
  try {
    dispatched = await deps.dispatch();
  } catch {
    void deps.stop(queued.runId, 'deadline').catch(() => undefined);
    deps.publicRuntimeContexts.delete(actorScope, requestKey);
    return { outcome: 'degraded', reason: 'runtime-error' };
  }
  if (dispatched.outcome === 'started' && dispatched.runId === queued.runId) deps.follow(queued.runId);
  if (dispatched.outcome === 'degraded' && dispatched.runId === queued.runId) {
    deps.publicRuntimeContexts.delete(actorScope, requestKey);
    return { outcome: 'degraded', reason: dispatched.reason.includes('额度') ? 'budget-exceeded' : 'runtime-error' };
  }
  if (dispatched.outcome === 'rejected' && dispatched.runId === queued.runId) {
    deps.publicRuntimeContexts.delete(actorScope, requestKey);
    return { outcome: 'degraded', reason: 'runtime-error' };
  }
  return waitPublicChatExecution(deps, queued.runId, input, actorScope, requestKey);
}

/** 轮询一次公开问答的增量文本事件并在到点时保留已生成正文（partial）或收敛降级原因。 */
export async function waitPublicChatExecution(
  deps: {
    runs: Pick<AgentExecutionRepositoryPort, 'listEvents' | 'findById'>;
    publicRuntimeContexts: PublicRuntimeContextStore;
    stop: (runId: string, cause: StopCause) => Promise<StopResult>;
  },
  runId: string,
  input: { principalId: string; deadlineAt: Date; signal?: AbortSignal; onText?: (text: string) => void },
  actorScope: string,
  requestKey: string,
): Promise<PublicChatExecutionResult> {
  let after = 0;
  let output = '';
  let visibleLength = 0;
  const startedAt = Date.now();

  while (true) {
    if (input.signal?.aborted) {
      void deps.stop(runId, 'user').catch(() => undefined);
      deps.publicRuntimeContexts.delete(actorScope, requestKey);
      return { outcome: 'degraded', reason: 'client-abort' };
    }
    if (Date.now() >= input.deadlineAt.getTime()) {
      void deps.stop(runId, 'deadline').catch(() => undefined);
      const runtimeContext = deps.publicRuntimeContexts.get(actorScope, requestKey);
      deps.publicRuntimeContexts.delete(actorScope, requestKey);
      // 到点了，但**已经生成的正文还在**：有内容就交付，如实标 partial。
      const visible = extractStreamedAnswer(output).trim();
      if (visible.length >= ASSISTANT_ANSWER_MIN_LENGTH) {
        const run = await deps.runs.findById(runId).catch(() => null);
        return {
          outcome: 'completed',
          runId,
          output,
          partial: true,
          sessionId: runtimeContext?.resultSessionId ?? null,
          tokensIn: run?.tokensIn ?? null,
          tokensOut: run?.tokensOut ?? null,
          elapsedMs: run?.elapsedMs ?? Date.now() - startedAt,
        };
      }
      return { outcome: 'degraded', reason: 'timeout' };
    }

    let events: Awaited<ReturnType<AgentExecutionRepositoryPort['listEvents']>>;
    let run: AgentExecutionRecord | null;
    try {
      events = await deps.runs.listEvents(runId, after, PUBLIC_EVENT_PAGE_SIZE);
      for (const event of events) {
        after = event.seq;
        if (event.kind !== 'text' || !event.text) continue;
        if (output.length < MAX_PUBLIC_EXECUTION_OUTPUT_CHARS) {
          output = `${output}${event.text}`.slice(0, MAX_PUBLIC_EXECUTION_OUTPUT_CHARS);
        }
        const visible = extractStreamedAnswer(output);
        if (visible.length > visibleLength) {
          try {
            input.onText?.(visible.slice(visibleLength));
          } catch {
            void deps.stop(runId, 'user').catch(() => undefined);
            deps.publicRuntimeContexts.delete(actorScope, requestKey);
            return { outcome: 'degraded', reason: 'client-abort' };
          }
          visibleLength = visible.length;
        }
      }
      run = await deps.runs.findById(runId);
    } catch {
      deps.publicRuntimeContexts.delete(actorScope, requestKey);
      return { outcome: 'degraded', reason: 'runtime-error' };
    }

    if (!run || run.origin !== 'public' || run.actor !== input.principalId || run.state === 'UNKNOWN') {
      deps.publicRuntimeContexts.delete(actorScope, requestKey);
      return { outcome: 'degraded', reason: 'runtime-error' };
    }
    if (run.state === 'SUCCEEDED') {
      const runtimeContext = deps.publicRuntimeContexts.get(actorScope, requestKey);
      deps.publicRuntimeContexts.delete(actorScope, requestKey);
      return {
        outcome: 'completed',
        runId,
        output,
        sessionId: runtimeContext?.resultSessionId ?? null,
        tokensIn: run.tokensIn,
        tokensOut: run.tokensOut,
        elapsedMs: run.elapsedMs ?? Date.now() - startedAt,
      };
    }
    if (run.state === 'FAILED' || run.state === 'CANCELLED') {
      deps.publicRuntimeContexts.delete(actorScope, requestKey);
      if (run.stopReason === 'deadline') return { outcome: 'degraded', reason: 'timeout' };
      if (run.stopReason === 'quota') return { outcome: 'degraded', reason: 'budget-exceeded' };
      if (run.state === 'CANCELLED') return { outcome: 'degraded', reason: 'user-stopped' };
      return { outcome: 'degraded', reason: 'runtime-error' };
    }
    await new Promise((resolve) => setTimeout(resolve, PUBLIC_RUN_POLL_MS));
  }
}
