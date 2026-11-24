import { recoveryDisposition, stopOutcome } from '@walker/shared';
import type { Logger } from '@nestjs/common';
import { ApiError } from '../common/http-error';
import type { AgentExecutionRecord, AgentExecutionRepositoryPort } from '../ports/agent-execution.repository';
import type { ExecutionQuotaPort } from '../ports/execution-quota.port';
import type { ProcessRegistryPort } from '../ports/process-registry.port';
import type { RuntimePort } from '../ports/runtime.port';
import type { PublicRuntimeContextStore } from './execution-runtime-context';

export const ISOLATED_SLOT_REASON = '关闭没有完成，模型槽继续占用';

/** 失败原因截断落盘格式：避免超长堆栈淹没日志。 */
export function describeExecutionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 500)}…` : message;
}

export type RecoveryResult = {
  bootId: string;
  isolated: string[];
  released: string[];
  occupied: string[];
};

export type StopCause = 'user' | 'deadline';
export type StopResult =
  | { outcome: 'stopped'; runId: string; state: 'CANCELLED' | 'FAILED' }
  | { outcome: 'isolated'; runId: string; reason: string }
  | { outcome: 'unchanged'; runId: string; state: string };

/** 关闭未确认完成时将运行标记为 UNKNOWN，保持槽位占用以防止并发双跑。 */
export async function isolateStoppingExecution(
  runs: Pick<AgentExecutionRepositoryPort, 'setStateUnless'>,
  run: Pick<AgentExecutionRecord, 'id' | 'leaseEpoch' | 'leaseOwner'>,
): Promise<StopResult> {
  await runs.setStateUnless({
    id: run.id,
    from: ['STOPPING'],
    to: 'UNKNOWN',
    epoch: run.leaseEpoch,
    owner: run.leaseOwner ?? undefined,
  });
  return { outcome: 'isolated', runId: run.id, reason: ISOLATED_SLOT_REASON };
}

/** 访客只能停止绑定到本人、文章位置和内容范围的 public chat。 */
export async function stopPublicExecution(
  deps: {
    runs: Pick<AgentExecutionRepositoryPort, 'findById'>;
    stop: (runId: string, cause: StopCause) => Promise<StopResult>;
  },
  runId: string,
  principalId: string,
  placementKey: string,
  scopeSlug: string,
): Promise<StopResult> {
  const run = await deps.runs.findById(runId);
  const scope = run?.resourceScope;
  if (!run || run.origin !== 'public' || run.kind !== 'chat' || run.actor !== principalId ||
      run.actorScope !== `public:${principalId}` || run.placementKey !== placementKey ||
      run.grantId != null || !run.deploymentId || run.deploymentGeneration == null ||
      !run.contentSnapshotId || scope?.kind !== 'content' || scope.ids.length !== 1 || scope.ids[0] !== scopeSlug) {
    throw new ApiError('execution-run-not-found', 404, '找不到这条公开运行');
  }
  return deps.stop(runId, 'user');
}

/** 单次停止状态机：排队直接取消，运行中先置 STOPPING 并索要退出证明后再释放槽。 */
export async function stopExecutionOnce(
  deps: {
    runs: Pick<AgentExecutionRepositoryPort, 'findById' | 'setStateUnless'>;
    runtime: Pick<RuntimePort, 'close'>;
  },
  runId: string,
  cause: StopCause,
): Promise<StopResult> {
  const run = await deps.runs.findById(runId);
  if (!run) return { outcome: 'unchanged', runId, state: 'ABSENT' };
  if (run.state === 'QUEUED') {
    const outcome = stopOutcome(cause);
    await deps.runs.setStateUnless({
      id: runId,
      from: ['QUEUED'],
      to: outcome.state,
      epoch: run.leaseEpoch,
      stopReason: outcome.stopReason,
    });
    return { outcome: 'stopped', runId, state: outcome.state };
  }
  if (run.state === 'CANCELLED' || run.state === 'FAILED' || run.state === 'SUCCEEDED') {
    return { outcome: 'unchanged', runId, state: run.state };
  }
  if (run.state === 'UNKNOWN') {
    return { outcome: 'isolated', runId, reason: ISOLATED_SLOT_REASON };
  }
  if (run.state === 'RUNNING' || run.state === 'CLAIMED') {
    const marked = await deps.runs.setStateUnless({
      id: runId,
      from: [run.state],
      to: 'STOPPING',
      epoch: run.leaseEpoch,
      owner: run.leaseOwner ?? undefined,
      stopReason: cause === 'deadline' ? 'deadline' : 'user',
    });
    if (!marked) {
      const latest = await deps.runs.findById(runId);
      if (!latest || latest.state === 'CANCELLED' || latest.state === 'FAILED' || latest.state === 'SUCCEEDED') {
        return { outcome: 'unchanged', runId, state: latest?.state ?? 'ABSENT' };
      }
      if (latest.state === 'UNKNOWN') return { outcome: 'isolated', runId, reason: ISOLATED_SLOT_REASON };
    }
  }
  const current = await deps.runs.findById(runId);
  if (!current || current.state !== 'STOPPING') {
    return { outcome: 'unchanged', runId, state: current?.state ?? 'ABSENT' };
  }
  try {
    const proof = await deps.runtime.close();
    if (!proof.exited) return isolateStoppingExecution(deps.runs, current);
  } catch {
    return isolateStoppingExecution(deps.runs, current);
  }
  const outcome = stopOutcome(cause);
  const wrote = await deps.runs.setStateUnless({
    id: runId,
    from: ['STOPPING'],
    to: outcome.state,
    epoch: current.leaseEpoch,
    owner: current.leaseOwner ?? undefined,
    stopReason: outcome.stopReason,
  });
  if (!wrote) {
    const latest = await deps.runs.findById(runId);
    if (latest?.state === 'UNKNOWN') return { outcome: 'isolated', runId, reason: ISOLATED_SLOT_REASON };
    return { outcome: 'unchanged', runId, state: latest?.state ?? 'ABSENT' };
  }
  return { outcome: 'stopped', runId, state: outcome.state };
}

/**
 * 启动核对：租约不属于当前批次就先标 UNKNOWN。
 * 只有登记身份被证明已退出才释放槽；活着、PID 被复用或无法证明都继续占用。
 */
export async function recoverExecutions(
  deps: {
    processes: Pick<ProcessRegistryPort, 'currentBatch' | 'inspect' | 'terminate'>;
    runs: Pick<AgentExecutionRepositoryPort, 'listRecoverable' | 'setStateUnless' | 'findById' | 'readProcess'>;
    quota: Pick<ExecutionQuotaPort, 'release'>;
  },
  now = new Date(),
): Promise<RecoveryResult> {
  const batch = await deps.processes.currentBatch();
  const rows = await deps.runs.listRecoverable();
  const isolated: string[] = [];
  const released: string[] = [];
  const occupied: string[] = [];
  for (const run of rows) {
    const lost = run.leaseOwner !== batch.bootId || !run.leaseUntil || run.leaseUntil <= now;
    if (lost && (run.state === 'CLAIMED' || run.state === 'RUNNING' || run.state === 'STOPPING')) {
      const marked = await deps.runs.setStateUnless({
        id: run.id,
        from: [run.state],
        to: 'UNKNOWN',
        epoch: run.leaseEpoch,
        owner: run.leaseOwner ?? undefined,
        stopReason: 'lease-lost',
      });
      if (marked) isolated.push(run.id);
    }
    const current = await deps.runs.findById(run.id);
    if (!current || current.state !== 'UNKNOWN') continue;
    const record = await deps.runs.readProcess(run.id);
    const observation = await deps.processes.inspect(record);
    const closed = observation === 'alive' ? await deps.processes.terminate(record) : null;
    const seen = closed === 'exited' ? 'exited' : closed === 'unproven' ? 'unproven' : observation;
    if (recoveryDisposition(seen) === 'occupy') {
      occupied.push(run.id);
      continue;
    }
    const wrote = await deps.runs.setStateUnless({
      id: run.id,
      from: ['UNKNOWN'],
      to: 'FAILED',
      epoch: current.leaseEpoch,
      owner: current.leaseOwner ?? undefined,
      stopReason: 'lease-lost',
    });
    if (wrote) {
      await deps.quota.release(run.id);
      released.push(run.id);
    } else {
      occupied.push(run.id);
    }
  }
  return { bootId: batch.bootId, isolated, released, occupied };
}

/** 跟随一条已进入 RUNNING 状态的运行直到产出终态结果、记录事件与 token 用量。 */
export async function followExecutionRun(
  deps: {
    runs: Pick<AgentExecutionRepositoryPort, 'findById' | 'locateRevision' | 'appendEvent' | 'setStateUnless'>;
    runtime: Pick<RuntimePort, 'run'>;
    logResources: {
      register(input: {
        conversationId: string;
        resourceType: 'native-session' | 'native-fork';
        resourceKey: string;
        agentRevisionId: string | null;
        parentKey: string | null;
        allowDuringDeletion?: boolean;
      }): Promise<unknown>;
    };
    publicRuntimeContexts: PublicRuntimeContextStore;
    logger: Pick<Logger, 'error'>;
    recordResult: (runId: string, usage: { tokensIn: number; tokensOut: number; elapsedMs: number } | null) => Promise<boolean>;
  },
  runId: string,
): Promise<void> {
  const run = await deps.runs.findById(runId);
  if (!run || run.state !== 'RUNNING' || !run.agentRevisionId || !run.input) return;
  const publicRuntimeContext = run.origin === 'public'
    ? deps.publicRuntimeContexts.get(run.actorScope, run.requestKey)
    : null;
  const seen: Array<{ kind: 'text' | 'usage'; text?: string; tokensIn?: number; tokensOut?: number }> = [];
  let eventWrites = Promise.resolve();
  let eventWriteError: unknown = null;
  const queueEvent = (input: Parameters<typeof deps.runs.appendEvent>[0]) => {
    eventWrites = eventWrites.then(async () => {
      if (eventWriteError) return;
      try { await deps.runs.appendEvent(input); }
      catch (error) { eventWriteError = error; }
    });
  };
  const started = Date.now();
  try {
    const located = await deps.runs.locateRevision(run.agentRevisionId);
    const result = await deps.runtime.run({
      prompt: run.input,
      owner: {
        visitorKey: publicRuntimeContext?.visitorKey ?? run.actor,
        agentRevisionId: run.agentRevisionId,
        agentId: located?.agentId ?? null,
        providerId: located?.providerId ?? null,
        modelId: located?.modelId ?? null,
        systemPrompt: located?.prompt ?? null,
      },
      ...(publicRuntimeContext?.sessionId ? { sessionId: publicRuntimeContext.sessionId } : {}),
      ...(publicRuntimeContext?.freshPrompt ? { freshPrompt: publicRuntimeContext.freshPrompt } : {}),
      ...(publicRuntimeContext ? {
        onSessionResource: async (resource: { sessionId: string; kind: 'native-session' | 'native-fork'; parentSessionId?: string | null }) => {
          if (!publicRuntimeContext.conversationId) return;
          const registered = await deps.logResources.register({
            conversationId: publicRuntimeContext.conversationId,
            resourceType: resource.kind,
            resourceKey: resource.sessionId,
            agentRevisionId: run.agentRevisionId,
            parentKey: resource.parentSessionId ?? null,
            allowDuringDeletion: true,
          });
          if (!registered) throw new Error('native-session-not-registered');
        },
      } : {}),
      observe: (event) => {
        if (event.kind === 'text' && event.text) {
          seen.push({ kind: 'text', text: event.text });
          queueEvent({ runId, kind: 'text', text: event.text });
        }
        if (event.kind === 'usage' && event.usage) {
          seen.push({ kind: 'usage', tokensIn: event.usage.inputTokens, tokensOut: event.usage.outputTokens });
          queueEvent({ runId, kind: 'usage', tokensIn: event.usage.inputTokens, tokensOut: event.usage.outputTokens });
        }
      },
    });
    await eventWrites;
    if (eventWriteError) throw eventWriteError;
    if (result.ok && publicRuntimeContext) publicRuntimeContext.resultSessionId = result.sessionId;
    const latest = await deps.runs.findById(runId);
    if (!latest || latest.state !== 'RUNNING') return;
    if (!result.ok) {
      await deps.runs.setStateUnless({
        id: runId, from: ['RUNNING'], to: 'FAILED', epoch: latest.leaseEpoch,
        owner: latest.leaseOwner ?? undefined, stopReason: 'runtime-error',
      });
      return;
    }
    if (result.usage && !seen.some((event) => event.kind === 'usage')) {
      await deps.runs.appendEvent({ runId, kind: 'usage', tokensIn: result.usage.inputTokens, tokensOut: result.usage.outputTokens });
    }
    await deps.recordResult(runId, result.usage
      ? { tokensIn: result.usage.inputTokens, tokensOut: result.usage.outputTokens, elapsedMs: Date.now() - started }
      : null);
  } catch (error) {
    await eventWrites;
    deps.logger.error(`run ${runId} failed: ${describeExecutionError(error)}`);
    const latest = await deps.runs.findById(runId);
    if (latest?.state === 'RUNNING') {
      await deps.runs.setStateUnless({
        id: runId, from: ['RUNNING'], to: 'FAILED', epoch: latest.leaseEpoch,
        owner: latest.leaseOwner ?? undefined, stopReason: 'runtime-error',
      });
    }
  }
}
