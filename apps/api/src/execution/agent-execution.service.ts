import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  nextPublicStreak,
  parseExecutionRunRequest,
  queueLane,
  selectClaim,
  slotOccupied,
  type ExecutionEventView,
  type ExecutionRunListItem,
  type ExecutionRunView,
  type AuthorizationGrantView,
} from '@walker/shared';
import { ApiError, validationError } from '../common/http-error';
import { AGENT_REVISION_REPOSITORY, type AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';
import { AUTHORIZATION_REPOSITORY, type AuthorizationRepositoryPort } from '../ports/authorization.repository';
import { AGENT_EXECUTION_REPOSITORY, type AgentExecutionRecord, type AgentExecutionRepositoryPort } from '../ports/agent-execution.repository';
import { EXECUTION_OBJECT_POLICY, type ExecutionObjectPolicyPort } from '../ports/execution-object-policy.port';
import { EXECUTION_QUOTA, type ExecutionQuotaPort } from '../ports/execution-quota.port';
import { OPERATIONS_JOURNAL, type OperationsJournalPort } from '../ports/operations-journal.port';
import { PROCESS_REGISTRY, type ProcessRegistryPort } from '../ports/process-registry.port';
import { RUNTIME_PORT, type RuntimePort } from '../ports/runtime.port';
import { LogResourceService } from '../log-resources/log-resource.service';
import { isRestoreGatePending, resolveRestoreGatePath } from '../runtime/restore-gate';
import { admitQueuedExecution, enqueueExecutionRun, preflightExecution, type ExecutionContext } from './execution-admission';
import {
  describeExecutionError,
  followExecutionRun,
  recoverExecutions,
  stopExecutionOnce,
  stopPublicExecution,
  type RecoveryResult,
  type StopCause,
  type StopResult,
} from './execution-lifecycle';
import { awaitExecutionTerminal, listOwnedEvents, listOwnedRuns, loadOwnedView, streamOwnedRun, type ExecutionRunOutcome } from './execution-owned-views';
import {
  runPublicChatExecution,
  type DispatchResult,
  type EnqueueResult,
  type PublicChatExecutionResult,
  type PublicChatRunInput,
} from './execution-public-chat';
import { PublicRuntimeContextStore } from './execution-runtime-context';

export type {
  ExecutionContext,
  EnqueueResult,
  DispatchResult,
  RecoveryResult,
  StopCause,
  StopResult,
  PublicChatExecutionResult,
  ExecutionRunOutcome,
};

const LEASE_MS = 30_000;
/** 调度泵的领用间隔（毫秒）。 */
const DISPATCH_INTERVAL_MS = 2_000;
const PUMP_MAX_BATCH = 10;
const QUEUED_FETCH_LIMIT = 100;
const DEFAULT_SAVED_TEXT_LIMIT = 100;

type Claimed = { outcome: 'claimed'; run: AgentExecutionRecord };

function isStorageFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const body = error.getResponse();
  return typeof body === 'object' && body !== null && 'code' in body &&
    (body as { code?: string }).code === 'storage-unavailable';
}

function isLocked(error: unknown): boolean {
  return error instanceof Error && /database is locked|SQLITE_BUSY/i.test(error.message);
}

@Injectable()
export class AgentExecutionService implements OnModuleInit, OnModuleDestroy {
  private readonly stopping = new Map<string, Promise<StopResult>>();
  private readonly publicRuntimeContexts = new PublicRuntimeContextStore();
  private readonly logger = new Logger('AgentExecution');
  private pump: ReturnType<typeof setInterval> | null = null;
  /** 泵的防重入：上一轮还没跑完就跳过这一轮，避免并发双开模型进程（R12 单槽）。 */
  private pumping = false;
  private stopped = false;
  lastRecovery: RecoveryResult | null = null;

  constructor(
    @Inject(AGENT_REVISION_REPOSITORY) private readonly agents: AgentRevisionRepositoryPort,
    @Inject(AUTHORIZATION_REPOSITORY) private readonly grants: AuthorizationRepositoryPort,
    @Inject(AGENT_EXECUTION_REPOSITORY) private readonly runs: AgentExecutionRepositoryPort,
    @Inject(EXECUTION_OBJECT_POLICY) private readonly objects: ExecutionObjectPolicyPort,
    @Inject(OPERATIONS_JOURNAL) private readonly journal: OperationsJournalPort,
    @Inject(EXECUTION_QUOTA) private readonly quota: ExecutionQuotaPort,
    @Inject(RUNTIME_PORT) private readonly runtime: RuntimePort,
    @Inject(PROCESS_REGISTRY) private readonly processes: ProcessRegistryPort,
    @Inject(LogResourceService) private readonly logResources: LogResourceService,
  ) {}

  async onModuleInit() {
    this.lastRecovery = await this.recover();
    if (process.env.WALKER_STARTUP_RECONCILIATION === '1') return;
    await this.startScheduler();
  }

  async startScheduler(): Promise<void> {
    if (this.pump || this.stopped || isRestoreGatePending(resolveRestoreGatePath())) return;
    await this.pumpOnce();
    this.pump = setInterval(() => void this.pumpOnce(), DISPATCH_INTERVAL_MS);
    this.pump.unref?.();
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.pump) {
      clearInterval(this.pump);
      this.pump = null;
    }
  }

  /** 供测试驱动泵的一轮（生产由 `onModuleInit` 的定时器调用，与生产走同一实现）。 */
  async pumpForTest(): Promise<void> {
    return this.pumpOnce();
  }

  private async pumpOnce(): Promise<void> {
    if (
      this.stopped ||
      this.pumping ||
      process.env.WALKER_STARTUP_RECONCILIATION === '1' ||
      isRestoreGatePending(resolveRestoreGatePath())
    ) {
      return;
    }
    this.pumping = true;
    try {
      for (let i = 0; i < PUMP_MAX_BATCH; i += 1) {
        const result = await this.dispatch();
        if (result.outcome === 'idle' || result.outcome === 'waiting') return;
        if (result.outcome === 'started') void this.follow(result.runId);
      }
    } catch (error) {
      this.logger.error(`调度泵失败：${describeExecutionError(error)}`);
    } finally {
      this.pumping = false;
    }
  }

  /** 调度入队前的策略检查。本身不写队列，也不启动模型。 */
  preflight(raw: unknown, context: ExecutionContext, now = new Date()) {
    return preflightExecution(
      { agents: this.agents, grants: this.grants, runs: this.runs, objects: this.objects },
      raw,
      context,
      now,
    );
  }

  /** 写入持久队列。队列满或入队时已过期则规则降级，不启动模型。 */
  enqueue(raw: unknown, context: ExecutionContext, options?: { now?: Date; deadline?: Date | null }): Promise<EnqueueResult> {
    return enqueueExecutionRun(
      { agents: this.agents, grants: this.grants, runs: this.runs, objects: this.objects, journal: this.journal },
      raw,
      context,
      options,
    );
  }

  /** 领取一条排队并启动模型。槽占用、过期、额度或授权失败都不调用 runtime.start。 */
  async dispatch(options?: { now?: Date }): Promise<DispatchResult> {
    try {
      return await this.dispatchOnce(options?.now ?? new Date());
    } catch (error) {
      if (!isLocked(error)) throw error;
      return this.dispatchOnce(options?.now ?? new Date());
    }
  }

  /** 成功结束后释放槽，并再结算一次。同一运行不会多扣。 */
  async finish(runId: string): Promise<boolean> {
    const run = await this.runs.findById(runId);
    if (!run || run.state !== 'RUNNING') return false;
    await this.quota.settle(runId);
    return this.recordResult(runId, null);
  }

  /** 只把仍在运行的结果写成成功；token 在此处终态记账。 */
  async recordResult(runId: string, usage: { tokensIn: number; tokensOut: number; elapsedMs: number } | null): Promise<boolean> {
    const run = await this.runs.findById(runId);
    if (!run || run.state !== 'RUNNING') return false;
    const written = await this.runs.setStateUnless({
      id: runId,
      from: ['RUNNING'],
      to: 'SUCCEEDED',
      epoch: run.leaseEpoch,
      owner: run.leaseOwner ?? undefined,
      ...(usage ? usage : {}),
    });
    if (written && usage) {
      await this.quota.recordUsage(runId, usage.tokensIn + usage.tokensOut)
        .catch((error: unknown) => { this.logger.error(`token 记账失败 run=${runId}：${describeExecutionError(error)}`); });
    }
    return written;
  }

  /** 等一条运行抵达终态——唯一一份等待实现（跟随运行自身的 deadline）。 */
  awaitTerminal(runId: string, options: { signal?: AbortSignal } = {}): Promise<ExecutionRunOutcome | null> {
    return awaitExecutionTerminal(this.runs, runId, options);
  }

  /** 这次运行已经落库的文本事件（按 seq 升序拼接）。 */
  async savedText(runId: string, limit = DEFAULT_SAVED_TEXT_LIMIT): Promise<string> {
    const events = await this.runs.listEvents(runId, 0, limit);
    return events.filter((event) => event.kind === 'text').map((event) => event.text ?? '').join('');
  }

  /** 排队中取消立刻终态；运行中先置 STOPPING 并索要退出证明后再释放槽。 */
  stop(runId: string, cause: StopCause = 'user'): Promise<StopResult> {
    const current = this.stopping.get(runId);
    if (current) return current;
    const work = stopExecutionOnce({ runs: this.runs, runtime: this.runtime }, runId, cause)
      .finally(() => { this.stopping.delete(runId); });
    this.stopping.set(runId, work);
    return work;
  }

  /** 访客只能停止绑定到本人、文章位置和内容范围的 public chat。 */
  stopPublicRun(runId: string, principalId: string, placementKey: string, scopeSlug: string): Promise<StopResult> {
    return stopPublicExecution(
      { runs: this.runs, stop: (id, cause) => this.stop(id, cause) },
      runId,
      principalId,
      placementKey,
      scopeSlug,
    );
  }

  /** 启动核对：清理失联租约并按进程退出证明决定释放还是保持 UNKNOWN。 */
  recover(now = new Date()): Promise<RecoveryResult> {
    return recoverExecutions({ processes: this.processes, runs: this.runs, quota: this.quota }, now);
  }

  /** 后台提交。来源固定为站主，同一幂等键只产生一条运行。 */
  async accept(raw: unknown): Promise<ExecutionRunView> {
    const parsed = parseExecutionRunRequest(raw);
    if (!parsed) throw validationError('运行请求字段无效');
    const located = await this.runs.locateRevision(parsed.submit.agentRevisionId);
    if (!located) throw new ApiError('execution-denied', 403, '当前请求不允许执行');
    const queued = await this.enqueue(parsed.submit, {
      origin: 'admin', principalType: 'owner', principalId: 'owner', agentId: located.agentId, grantId: parsed.grantId,
    });
    if (queued.outcome !== 'queued') throw new ApiError('execution-degraded', 429, queued.reason);
    const dispatched = await this.dispatch();
    if (dispatched.outcome === 'started' && dispatched.runId === queued.runId) void this.follow(queued.runId);
    return this.ownedView(queued.runId);
  }

  /** 公共问答的内部入口：固定 public/visitor/chat 并在统一队列中流式等待结果。 */
  runPublicChat(input: PublicChatRunInput): Promise<PublicChatExecutionResult> {
    return runPublicChatExecution(
      {
        runs: this.runs,
        publicRuntimeContexts: this.publicRuntimeContexts,
        enqueue: (raw, context, options) => this.enqueue(raw, context, options),
        dispatch: () => this.dispatch(),
        follow: (runId) => { void this.follow(runId); },
        stop: (runId, cause) => this.stop(runId, cause),
      },
      input,
    );
  }

  ownedRun(id: string): Promise<ExecutionRunView> {
    return this.ownedView(id);
  }

  ownedRuns(cursor: string | undefined, limit = 20, agentId?: string): Promise<{ items: ExecutionRunListItem[]; next: string | null; total: number }> {
    return listOwnedRuns(this.runs, cursor, limit, agentId);
  }

  ownedEvents(id: string, after: string | undefined): Promise<{ items: ExecutionEventView[]; next: number | null }> {
    return listOwnedEvents(this.runs, id, after);
  }

  streamOwned(id: string, signal: AbortSignal, write: (chunk: string) => void): Promise<void> {
    return streamOwnedRun(this.runs, id, signal, write);
  }

  async stopOwned(id: string): Promise<ExecutionRunView> {
    await this.ownedView(id);
    await this.stop(id, 'user');
    return this.ownedView(id);
  }

  private ownedView(id: string): Promise<ExecutionRunView> {
    return loadOwnedView(this.runs, id);
  }

  private follow(runId: string): Promise<void> {
    return followExecutionRun(
      {
        runs: this.runs,
        runtime: this.runtime,
        logResources: this.logResources,
        publicRuntimeContexts: this.publicRuntimeContexts,
        logger: this.logger,
        recordResult: (id, usage) => this.recordResult(id, usage),
      },
      runId,
    );
  }

  private async dispatchOnce(now: Date): Promise<DispatchResult> {
    let decision: DispatchResult | Claimed;
    try {
      decision = await this.journal.transaction(async (tx) => {
        await tx.runs.lockSchedule();
        const queued = await tx.runs.list(['QUEUED'], QUEUED_FETCH_LIMIT);
        const expired: string[] = [];
        for (const row of queued) {
          if (row.deadline && row.deadline <= now) {
            await tx.runs.setStateUnless({ id: row.id, from: ['QUEUED'], to: 'FAILED', epoch: row.leaseEpoch, stopReason: 'deadline' });
            expired.push(row.id);
          }
        }
        if (slotOccupied(await tx.runs.countOccupying())) return { outcome: 'waiting' as const };
        const live = queued.filter((row) => !expired.includes(row.id));
        const streak = await tx.runs.streak();
        const pick = selectClaim({
          waiters: live.map((row) => ({ id: row.id, lane: queueLane(row.origin), createdAt: row.createdAt.getTime() })),
          consecutivePublicClaims: streak,
        });
        if (!pick) {
          return expired.length
            ? { outcome: 'degraded' as const, runId: expired[0], reason: '排队时间已超过截止时间，已改为规则处理' }
            : { outcome: 'idle' as const };
        }
        const run = live.find((row) => row.id === pick.id);
        if (!run) return { outcome: 'idle' as const };
        const grant = run.grantId ? await tx.grants.find(run.grantId) : null;
        const admission = await this.admit(tx.runs, run, grant, now);
        if (!admission.ok) {
          await tx.runs.setStateUnless({ id: run.id, from: ['QUEUED'], to: 'FAILED', epoch: run.leaseEpoch });
          return { outcome: 'rejected' as const, runId: run.id, reason: admission.reason };
        }
        const reserved = await this.quota.reserve(tx.client, run.id, run.grantId ?? null);
        if (reserved === 'exhausted' || reserved === 'charged' || reserved === 'released') {
          await tx.runs.setStateUnless({ id: run.id, from: ['QUEUED'], to: 'FAILED', epoch: run.leaseEpoch, stopReason: 'quota' });
          const reason = reserved === 'exhausted' ? '额度已用完，已改为规则处理' : '这次运行不再启动模型，已改为规则处理';
          return { outcome: 'degraded' as const, runId: run.id, reason };
        }
        const batch = await this.processes.currentBatch();
        const claimed = await tx.runs.claim(run.id, batch.bootId, now, new Date(now.getTime() + LEASE_MS));
        if (!claimed) return { outcome: 'waiting' as const };
        await tx.runs.setStreak(nextPublicStreak(pick.lane, streak));
        return { outcome: 'claimed' as const, run: claimed };
      });
    } catch (error) {
      if (isStorageFailure(error)) return { outcome: 'degraded', runId: null, reason: '额度暂时无法预留，已改为规则处理' };
      throw error;
    }
    if (decision.outcome !== 'claimed') return decision;
    const run = decision.run;
    try {
      const revision = run.agentRevisionId ? await this.runs.locateRevision(run.agentRevisionId) : null;
      if (!revision) throw new Error('agent revision missing');
      await this.runtime.start({
        visitorKey: run.actor, agentRevisionId: run.agentRevisionId!,
        agentId: revision.agentId, systemPrompt: revision.prompt,
        providerId: revision.providerId, modelId: revision.modelId,
      });
    } catch (error) {
      this.logger.error(`runtime start failed: ${describeExecutionError(error)}`);
      await this.quota.release(run.id).catch(() => undefined);
      await this.runs.setStateUnless({
        id: run.id, from: ['CLAIMED'], to: 'FAILED', epoch: run.leaseEpoch,
        owner: run.leaseOwner ?? undefined, stopReason: 'runtime-error',
      });
      return { outcome: 'degraded', runId: run.id, reason: '模型未能启动，已改为规则处理' };
    }
    const batch = await this.processes.currentBatch();
    await this.runs.recordProcess({ runId: run.id, bootId: batch.bootId, pid: null, startedAt: null });
    await this.quota.settle(run.id);
    const moved = await this.runs.setStateUnless({
      id: run.id, from: ['CLAIMED'], to: 'RUNNING', epoch: run.leaseEpoch, owner: run.leaseOwner ?? undefined,
    });
    if (!moved) throw new Error('领取后的运行状态已变化');
    return { outcome: 'started', runId: run.id };
  }

  private admit(
    runs: AgentExecutionRepositoryPort,
    run: AgentExecutionRecord,
    grant: AuthorizationGrantView | null,
    now: Date,
  ) {
    return admitQueuedExecution(this.objects, runs, run, grant, now);
  }
}
