import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

/** 失败原因要落到日志里：'runtime-error' 只是分类，没有它就无法排查。 */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 500)}…` : message;
}
import {
  admissionDeadline, denialReason, executionPolicyAllows, nextPublicStreak, parseEventCursor,
  parseExecutionRunRequest, parseExecutionSubmit, parseRunCursor,
  queueAdmission, queueLane, READ_ONLY_PROFILE, recoveryDisposition, selectClaim, slotOccupied, stopOutcome,
  extractStreamedAnswer,
  ASSISTANT_ANSWER_MIN_LENGTH,
  type ExecutionEventView, type ExecutionRunListItem, type ExecutionRunView,
  type AgentAction, type AuthorizationGrantView, type RunOrigin,
} from '@walker/shared';
import { ApiError, validationError } from '../common/http-error';
import { AGENT_REVISION_REPOSITORY, type AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';
import { AUTHORIZATION_REPOSITORY, type AuthorizationRepositoryPort } from '../ports/authorization.repository';
import {
  AGENT_EXECUTION_REPOSITORY, type AgentExecutionRecord, type AgentExecutionRepositoryPort,
} from '../ports/agent-execution.repository';
import { EXECUTION_OBJECT_POLICY, type ExecutionObjectPolicyPort } from '../ports/execution-object-policy.port';
import { EXECUTION_QUOTA, type ExecutionQuotaPort } from '../ports/execution-quota.port';
import { OPERATIONS_JOURNAL, type OperationsJournalPort } from '../ports/operations-journal.port';
import { PROCESS_REGISTRY, type ProcessRegistryPort } from '../ports/process-registry.port';
import { RUNTIME_PORT, type RuntimePort } from '../ports/runtime.port';
import { LogResourceService } from '../log-resources/log-resource.service';
import { isRestoreGatePending, resolveRestoreGatePath } from '../runtime/restore-gate';


const LEASE_MS = 30_000;
const MAX_PUBLIC_EXECUTION_INPUT_CHARS = 90_000;
const MAX_PUBLIC_EXECUTION_OUTPUT_CHARS = 24_000;
const PUBLIC_RUN_POLL_MS = 80;
/** awaitTerminal 的轮询间隔：终态判定不需要抢毫秒，但也不能慢到让调用方多等一秒。 */
const TERMINAL_POLL_MS = 250;
/** 终态落库（事件、usage、释放槽）留的余量。 */
const TERMINAL_GRACE_MS = 5_000;

/**
 * 调度泵的领用间隔（毫秒）。
 *
 * 设计文档 §10.2 明确要求「**持久队列由 Nest 内定时器领用**」——此前只实现了
 * 「提交时试一次 dispatch」，于是提交时槽位忙就会永久卡在 QUEUED：没有任何东西再唤醒它，
 * 而且这些 run 会持续占着额度预留与等待队列名额（越用越不可用）。
 * 单槽 + 模型调用通常数秒，2s 足够及时又不会空转太频繁。
 */
const DISPATCH_INTERVAL_MS = 2_000;



/** 此上下文由鉴权/会话/调度器构造，绝不能从请求体展开。 */
export type ExecutionContext = {
  origin: RunOrigin; principalType: 'owner' | 'visitor' | 'system'; principalId: string;
  agentId: string; grantId: string | null; parentRunId?: string;
  deploymentId?: string | null;
  placementKey?: string | null;
  deploymentGeneration?: number | null;
  contentSnapshotId?: string | null;
  conversationId?: string | null;
};

export type EnqueueResult =
  | { outcome: 'queued'; runId: string }
  | { outcome: 'degraded'; reason: string };

export type DispatchResult =
  | { outcome: 'started'; runId: string }
  | { outcome: 'waiting' }
  | { outcome: 'idle' }
  | { outcome: 'degraded'; runId: string | null; reason: string }
  | { outcome: 'rejected'; runId: string; reason: string };

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
  | { outcome: 'degraded'; reason: 'queue-full' | 'queue-deadline' | 'budget-exceeded' | 'timeout' | 'client-abort' | 'user-stopped' | 'runtime-error' };

type PublicRuntimeContext = { visitorKey: string; sessionId: string | null; freshPrompt?: string; resultSessionId: string | null; conversationId: string | null };

type Claimed = { outcome: 'claimed'; run: AgentExecutionRecord };

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

function outcomeOf(run: AgentExecutionRecord): ExecutionRunOutcome {
  const state = run.state as ExecutionRunOutcome['state'];
  return {
    runId: run.id, state, stopReason: run.stopReason, success: state === 'SUCCEEDED',
    elapsedMs: run.elapsedMs, tokensIn: run.tokensIn, tokensOut: run.tokensOut,
  };
}

function isStorageFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const body = error.getResponse();
  return typeof body === 'object' && body !== null && 'code' in body &&
    (body as { code?: string }).code === 'storage-unavailable';
}

function isLocked(error: unknown): boolean {
  return error instanceof Error && /database is locked|SQLITE_BUSY/i.test(error.message);
}

function viewOf(run: AgentExecutionRecord): ExecutionRunView {
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

@Injectable()
export class AgentExecutionService implements OnModuleInit, OnModuleDestroy {
  private readonly stopping = new Map<string, Promise<StopResult>>();
  private readonly publicRuntimeContexts = new Map<string, PublicRuntimeContext>();
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
    // 恢复完就先推一次：重启前遗留的 QUEUED 不该等到下一个间隔才被看见。
    await this.pumpOnce();
    this.pump = setInterval(() => void this.pumpOnce(), DISPATCH_INTERVAL_MS);
    // 泵不该拖住进程退出（测试与优雅关闭都要求能收干净）。
    this.pump.unref?.();
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.pump) {
      clearInterval(this.pump);
      this.pump = null;
    }
  }

  /**
   * 定时领用：把可调度的 QUEUED 逐个推进（每次 dispatch 最多领一个，符合单槽纪律）。
   *
   * 为什么复用 `dispatch()` 而不是另写一套领取：`dispatchOnce` 已经在事务里做了
   * lockSchedule → slotOccupied → 原子 claim，任何并行领取都会被它挡住。
   * 这里**只负责"反复敲门"**，绝不自己判断能不能跑。
   */
  /**
   * 供测试驱动泵的一轮（生产由 `onModuleInit` 的定时器调用）。
   * 测试模块常常不 .init()（要避开启动核对），所以需要这个显式入口，
   * 但走的**必须是同一个实现**——否则测试与生产就会各跑一套。
   */
  async pumpForTest(): Promise<void> {
    return this.pumpOnce();
  }

  private async pumpOnce(): Promise<void> {
    if (this.stopped || this.pumping || process.env.WALKER_STARTUP_RECONCILIATION === '1' ||
        isRestoreGatePending(resolveRestoreGatePath())) return;
    this.pumping = true;
    try {
      // 一次 tick 内尽量把队列抽干；靠 claim 原子性保证绝不双开。
      for (let i = 0; i < 10; i += 1) {
        const result = await this.dispatch();
        if (result.outcome === 'idle' || result.outcome === 'waiting') return;
        if (result.outcome === 'started') void this.follow(result.runId);
        // degraded / rejected 表示这一个已被处理掉，继续看下一个。
      }
    } catch (error) {
      // 泵必须自己吞掉异常：抛出去会变成 unhandled rejection 并让定时器失效。
      this.logger.error(`调度泵失败：${describeError(error)}`);
    } finally {
      this.pumping = false;
    }
  }

  /** 调度入队前的策略检查。本身不写队列，也不启动模型。 */
  async preflight(raw: unknown, context: ExecutionContext, now = new Date()) {
    const input = parseExecutionSubmit(raw, context.origin === 'public' ? MAX_PUBLIC_EXECUTION_INPUT_CHARS : 20_000);
    if (!input) throw validationError('运行请求字段无效');
    const denied = () => new ApiError('execution-denied', 403, '当前请求不允许执行');
    if (context.origin === 'public' && context.deploymentId && (input.kind !== 'chat' || !input.targetId)) throw denied();
    if ((context.origin === 'admin' && context.principalType !== 'owner') ||
        (context.origin === 'system' && context.principalType !== 'system')) throw denied();
    const agent = await this.agents.detail(context.agentId);
    const revision = agent?.revisions.find((row) => row.id === input.agentRevisionId);
    if (!agent || agent.archivedAt || !revision) throw denied();
    const agentActions: AgentAction[] = revision.toolProfile.id === READ_ONLY_PROFILE.id && revision.toolProfile.version === READ_ONLY_PROFILE.version ? ['agent:run', 'content:read'] : [];
    const kind = input.targetId ? 'content' as const : 'agent' as const;
    const target = input.targetId ?? context.agentId;
    if (input.kind === 'file' && !input.targetId) throw denied();
    const grant = context.grantId ? await this.grants.find(context.grantId) : null;
    let parent: Parameters<typeof executionPolicyAllows>[0]['parent'];
    if (context.parentRunId) {
      const run = await this.runs.findById(context.parentRunId);
      if (!run || run.state !== 'RUNNING' || run.actor !== context.principalId ||
          run.grantId !== context.grantId || (run.deadline && run.deadline <= now)) throw denied();
      if (!grant || !run.resourceScope) throw denied();
      parent = { origin: run.origin, principalId: run.actor, actions: grant.actions, scope: run.resourceScope, grantId: run.grantId ?? null };
    }
    const objectActions = await this.objects.actions(kind, target, context.agentId);
    for (const action of (input.targetId ? ['agent:run', 'content:read'] : ['agent:run']) as AgentAction[]) {
      if (!executionPolicyAllows({ ...context, action, resourceKind: kind, resourceId: target, now: now.getTime(), agentActions, objectActions, grant, parent })) throw denied();
    }
    return { input, context, revision, resourceScope: { kind, ids: [target] }, grantRevision: grant?.revision ?? null, inputHash: createHash('sha256').update(JSON.stringify(input)).digest('hex') };
  }

  /** 写入持久队列。队列满或入队时已过期则规则降级，不启动模型。 */
  async enqueue(raw: unknown, context: ExecutionContext, options?: { now?: Date; deadline?: Date | null }): Promise<EnqueueResult> {
    const now = options?.now ?? new Date();
    const checked = await this.preflight(raw, context, now);
    const deadline = admissionDeadline(context.origin, now.getTime(), options?.deadline ? options.deadline.getTime() : null);
    const lane = queueLane(context.origin);
    const actorScope = `${context.origin}:${context.principalId}`;
    return this.journal.transaction(async (tx) => {
      await tx.runs.lockSchedule();
      const existing = await tx.runs.findByRequest(actorScope, checked.input.requestKey);
      if (existing) return { outcome: 'queued' as const, runId: existing.id };
      const waiting = await tx.runs.countWaiting(lane, now);
      const admission = queueAdmission({ lane, waiting, deadline, now: now.getTime() });
      if (!admission.ok) return { outcome: 'degraded' as const, reason: admission.reason };
      const submitted = await tx.runs.submitIfAbsent({
        id: randomUUID(), kind: checked.input.kind, origin: context.origin, actor: context.principalId, actorScope,
        agentRevisionId: checked.input.agentRevisionId, requestKey: checked.input.requestKey, inputHash: checked.inputHash,
        deploymentId: context.deploymentId ?? null,
        placementKey: context.placementKey ?? null,
        deploymentGeneration: context.deploymentGeneration ?? null,
        contentSnapshotId: context.contentSnapshotId ?? null,
        input: checked.input.input, resourceScope: checked.resourceScope, deadline: new Date(deadline),
        ...(context.conversationId ? { conversationId: context.conversationId } : {}),
        parentRunId: context.parentRunId ?? null, grantId: context.grantId,
      });
      if (context.origin === 'admin') {
        await tx.runs.markRetention(submitted.run.id, {
          retainUntil: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          diagnosticName: `run-${submitted.run.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}.log`,
        });
      }
      return { outcome: 'queued' as const, runId: submitted.run.id };
    });
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

  /**
   * 只把仍在运行的结果写成成功。停止中、已取消或已隔离的运行拒绝写入。
   *
   * token 在这里**终态记账**：预留时不知道要花多少，只有跑完才知道。
   */
  async recordResult(runId: string, usage: { tokensIn: number; tokensOut: number; elapsedMs: number } | null): Promise<boolean> {
    const run = await this.runs.findById(runId);
    if (!run || run.state !== 'RUNNING') return false;
    const written = await this.runs.setStateUnless({
      id: runId, from: ['RUNNING'], to: 'SUCCEEDED', epoch: run.leaseEpoch, owner: run.leaseOwner ?? undefined,
      ...(usage ? usage : {}),
    });
    if (written && usage) {
      // token 记账失败不能反过来把已成功的运行判失败，但也**不许静默**——
      // 静默吞掉会让授权额度悄悄少记，账对不上却没人知道。
      await this.quota.recordUsage(runId, usage.tokensIn + usage.tokensOut)
        .catch((error: unknown) => { this.logger.error(`token 记账失败 run=${runId}：${describeError(error)}`); });
    }
    return written;
  }

  /**
   * 等一条运行抵达终态——**唯一一份等待实现**。
   *
   * 等待窗口跟随运行自己的 deadline（入队时就写死在 `ExecutionRun.deadline`）：
   * 调用方不需要、也不该自己拍一个魔法秒数。历史事故正是两处各自拍窗口——
   * 一处 30×50ms、一处 40×50ms——模型要 2.3–32 秒，于是「答得快就成功、
   * 答得慢就返回空」，还把空当成成功。
   *
   * 这里把 UNKNOWN 也算"等到了"：它的语义是"没能证明进程退出"，再多等也不会自己变；
   * 调用方一律把非 SUCCEEDED 当失败，早返回只会更保守。**注意这不是删除流程那条规则**
   * （那边用 `PROVEN_STOPPED_RUN_STATES`，刻意不含 UNKNOWN）。
   */
  async awaitTerminal(runId: string, options: { signal?: AbortSignal } = {}): Promise<ExecutionRunOutcome | null> {
    let run = await this.runs.findById(runId);
    if (!run) return null;
    const terminal = (state: string) => state === 'SUCCEEDED' || state === 'FAILED' || state === 'CANCELLED' || state === 'UNKNOWN';
    if (terminal(run.state)) return outcomeOf(run);
    // 终态还要落库（事件、usage），给一点余量；deadline 为空的运行给保守上限。
    const until = (run.deadline ? run.deadline.getTime() : Date.now() + 120_000) + TERMINAL_GRACE_MS;
    while (Date.now() < until) {
      if (options.signal?.aborted) return outcomeOf(run);
      await new Promise((resolve) => setTimeout(resolve, TERMINAL_POLL_MS));
      run = await this.runs.findById(runId);
      if (!run) return null;
      if (terminal(run.state)) return outcomeOf(run);
    }
    return outcomeOf(run);
  }

  /** 这次运行已经落库的文本事件（按 seq 升序拼接）。读取规则只有这一份。 */
  async savedText(runId: string, limit = 100): Promise<string> {
    const events = await this.runs.listEvents(runId, 0, limit);
    return events.filter((event) => event.kind === 'text').map((event) => event.text ?? '').join('');
  }

  /**
   * 排队中的取消立刻终态，不关闭进程。运行中先记 STOPPING，等到 close 给出退出证明才释放槽。
   * 证明缺失时保持 UNKNOWN，槽继续占用。
   */
  stop(runId: string, cause: StopCause = 'user'): Promise<StopResult> {
    const current = this.stopping.get(runId);
    if (current) return current;
    const work = this.stopOnce(runId, cause).finally(() => { this.stopping.delete(runId); });
    this.stopping.set(runId, work);
    return work;
  }

  /** 访客只能停止绑定到本人、文章位置和内容范围的 public chat。 */
  async stopPublicRun(runId: string, principalId: string, placementKey: string, scopeSlug: string): Promise<StopResult> {
    const run = await this.runs.findById(runId);
    const scope = run?.resourceScope;
    if (!run || run.origin !== 'public' || run.kind !== 'chat' || run.actor !== principalId ||
        run.actorScope !== `public:${principalId}` || run.placementKey !== placementKey ||
        run.grantId != null || !run.deploymentId || run.deploymentGeneration == null ||
        !run.contentSnapshotId || scope?.kind !== 'content' || scope.ids.length !== 1 || scope.ids[0] !== scopeSlug) {
      throw new ApiError('execution-run-not-found', 404, '找不到这条公开运行');
    }
    return this.stop(runId, 'user');
  }

  private async stopOnce(runId: string, cause: StopCause): Promise<StopResult> {
    const run = await this.runs.findById(runId);
    if (!run) return { outcome: 'unchanged', runId, state: 'ABSENT' };
    if (run.state === 'QUEUED') {
      const outcome = stopOutcome(cause);
      await this.runs.setStateUnless({
        id: runId, from: ['QUEUED'], to: outcome.state, epoch: run.leaseEpoch, stopReason: outcome.stopReason,
      });
      return { outcome: 'stopped', runId, state: outcome.state };
    }
    if (run.state === 'CANCELLED' || run.state === 'FAILED' || run.state === 'SUCCEEDED') {
      return { outcome: 'unchanged', runId, state: run.state };
    }
    if (run.state === 'UNKNOWN') {
      return { outcome: 'isolated', runId, reason: '关闭没有完成，模型槽继续占用' };
    }
    if (run.state === 'RUNNING' || run.state === 'CLAIMED') {
      const marked = await this.runs.setStateUnless({
        id: runId, from: [run.state], to: 'STOPPING', epoch: run.leaseEpoch,
        owner: run.leaseOwner ?? undefined, stopReason: cause === 'deadline' ? 'deadline' : 'user',
      });
      if (!marked) {
        const latest = await this.runs.findById(runId);
        if (!latest || latest.state === 'CANCELLED' || latest.state === 'FAILED' || latest.state === 'SUCCEEDED') {
          return { outcome: 'unchanged', runId, state: latest?.state ?? 'ABSENT' };
        }
        if (latest.state === 'UNKNOWN') return { outcome: 'isolated', runId, reason: '关闭没有完成，模型槽继续占用' };
      }
    }
    const current = await this.runs.findById(runId);
    if (!current || current.state !== 'STOPPING') {
      return { outcome: 'unchanged', runId, state: current?.state ?? 'ABSENT' };
    }
    try {
      const proof = await this.runtime.close();
      if (!proof.exited) return this.isolate(current);
    } catch {
      return this.isolate(current);
    }
    const outcome = stopOutcome(cause);
    const wrote = await this.runs.setStateUnless({
      id: runId, from: ['STOPPING'], to: outcome.state, epoch: current.leaseEpoch,
      owner: current.leaseOwner ?? undefined, stopReason: outcome.stopReason,
    });
    if (!wrote) {
      const latest = await this.runs.findById(runId);
      if (latest?.state === 'UNKNOWN') return { outcome: 'isolated', runId, reason: '关闭没有完成，模型槽继续占用' };
      return { outcome: 'unchanged', runId, state: latest?.state ?? 'ABSENT' };
    }
    return { outcome: 'stopped', runId, state: outcome.state };
  }

  /**
   * 启动核对。租约不属于当前批次就先标 UNKNOWN。
   * 只有登记身份被证明已退出才释放槽；活着、PID 被复用或无法证明都继续占用。
   */
  async recover(now = new Date()): Promise<RecoveryResult> {
    const batch = await this.processes.currentBatch();
    const rows = await this.runs.listRecoverable();
    const isolated: string[] = [];
    const released: string[] = [];
    const occupied: string[] = [];
    for (const run of rows) {
      const lost = run.leaseOwner !== batch.bootId || !run.leaseUntil || run.leaseUntil <= now;
      if (lost && (run.state === 'CLAIMED' || run.state === 'RUNNING' || run.state === 'STOPPING')) {
        const marked = await this.runs.setStateUnless({
          id: run.id, from: [run.state], to: 'UNKNOWN', epoch: run.leaseEpoch,
          owner: run.leaseOwner ?? undefined, stopReason: 'lease-lost',
        });
        if (marked) isolated.push(run.id);
      }
      const current = await this.runs.findById(run.id);
      if (!current || current.state !== 'UNKNOWN') continue;
      const record = await this.runs.readProcess(run.id);
      const observation = await this.processes.inspect(record);
      const closed = observation === 'alive' ? await this.processes.terminate(record) : null;
      const seen = closed === 'exited' ? 'exited' : closed === 'unproven' ? 'unproven' : observation;
      if (recoveryDisposition(seen) === 'occupy') {
        occupied.push(run.id);
        continue;
      }
      const wrote = await this.runs.setStateUnless({
        id: run.id, from: ['UNKNOWN'], to: 'FAILED', epoch: current.leaseEpoch,
        owner: current.leaseOwner ?? undefined, stopReason: 'lease-lost',
      });
      if (wrote) {
        await this.quota.release(run.id);
        released.push(run.id);
      } else {
        occupied.push(run.id);
      }
    }
    return { bootId: batch.bootId, isolated, released, occupied };
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

  /**
   * 公共问答的内部入口。控制器不能直接提交任意 Run：此方法固定 public/visitor/chat，
   * 绑定文章范围、部署代次与核验快照，并在同一持久队列中等待本次结果。
   */
  async runPublicChat(input: {
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
  }): Promise<PublicChatExecutionResult> {
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
    const runtimeContextKey = `public:${input.principalId}\n${input.requestKey}`;
    this.publicRuntimeContexts.set(runtimeContextKey, {
      visitorKey: input.runtimeVisitorKey,
      sessionId: input.runtimeSessionId ?? null,
      freshPrompt: input.freshPrompt,
      resultSessionId: null,
      conversationId: input.conversationId ?? null,
    });

    let queued: EnqueueResult;
    try {
      queued = await this.enqueue({
        requestKey: input.requestKey,
        kind: 'chat',
        agentRevisionId: input.agentRevisionId,
        targetId: input.targetSlug,
        input: input.prompt,
      }, context, { deadline: input.deadlineAt });
    } catch {
      this.publicRuntimeContexts.delete(runtimeContextKey);
      return { outcome: 'degraded', reason: 'runtime-error' };
    }
    if (queued.outcome === 'degraded') {
      this.publicRuntimeContexts.delete(runtimeContextKey);
      return {
        outcome: 'degraded',
        reason: queued.reason.includes('截止') ? 'queue-deadline' : 'queue-full',
      };
    }
    try {
      await input.onQueued?.(queued.runId);
    } catch {
      void this.stop(queued.runId, 'deadline').catch(() => undefined);
      this.publicRuntimeContexts.delete(runtimeContextKey);
      return { outcome: 'degraded', reason: 'runtime-error' };
    }

    let dispatched: DispatchResult;
    try {
      dispatched = await this.dispatch();
    } catch {
      void this.stop(queued.runId, 'deadline').catch(() => undefined);
      this.publicRuntimeContexts.delete(runtimeContextKey);
      return { outcome: 'degraded', reason: 'runtime-error' };
    }
    if (dispatched.outcome === 'started' && dispatched.runId === queued.runId) void this.follow(queued.runId);
    if (dispatched.outcome === 'degraded' && dispatched.runId === queued.runId) {
      this.publicRuntimeContexts.delete(runtimeContextKey);
      return { outcome: 'degraded', reason: dispatched.reason.includes('额度') ? 'budget-exceeded' : 'runtime-error' };
    }
    if (dispatched.outcome === 'rejected' && dispatched.runId === queued.runId) {
      this.publicRuntimeContexts.delete(runtimeContextKey);
      return { outcome: 'degraded', reason: 'runtime-error' };
    }
    return this.waitPublicChat(queued.runId, input, runtimeContextKey);
  }

  private async waitPublicChat(
    runId: string,
    input: { principalId: string; deadlineAt: Date; signal?: AbortSignal; onText?: (text: string) => void },
    runtimeContextKey: string,
  ): Promise<PublicChatExecutionResult> {
    let after = 0;
    let output = '';
    let visibleLength = 0;
    const startedAt = Date.now();

    while (true) {
      if (input.signal?.aborted) {
        void this.stop(runId, 'user').catch(() => undefined);
        this.publicRuntimeContexts.delete(runtimeContextKey);
        return { outcome: 'degraded', reason: 'client-abort' };
      }
      if (Date.now() >= input.deadlineAt.getTime()) {
        void this.stop(runId, 'deadline').catch(() => undefined);
        const runtimeContext = this.publicRuntimeContexts.get(runtimeContextKey);
        this.publicRuntimeContexts.delete(runtimeContextKey);
        // 到点了，但**已经生成的正文还在**：事件已落库，访客在流里也已经看到。
        // 丢掉它换成规则文案，等于把已经提供的服务说成没提供。有内容就交付，如实标 partial。
        const visible = extractStreamedAnswer(output).trim();
        if (visible.length >= ASSISTANT_ANSWER_MIN_LENGTH) {
          const run = await this.runs.findById(runId).catch(() => null);
          return {
            outcome: 'completed', runId, output, partial: true,
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
        events = await this.runs.listEvents(runId, after, 50);
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
              void this.stop(runId, 'user').catch(() => undefined);
              this.publicRuntimeContexts.delete(runtimeContextKey);
              return { outcome: 'degraded', reason: 'client-abort' };
            }
            visibleLength = visible.length;
          }
        }
        run = await this.runs.findById(runId);
      } catch {
        this.publicRuntimeContexts.delete(runtimeContextKey);
        return { outcome: 'degraded', reason: 'runtime-error' };
      }

      if (!run || run.origin !== 'public' || run.actor !== input.principalId) {
        this.publicRuntimeContexts.delete(runtimeContextKey);
        return { outcome: 'degraded', reason: 'runtime-error' };
      }
      if (run.state === 'UNKNOWN') {
        this.publicRuntimeContexts.delete(runtimeContextKey);
        return { outcome: 'degraded', reason: 'runtime-error' };
      }
      if (run.state === 'SUCCEEDED') {
        const runtimeContext = this.publicRuntimeContexts.get(runtimeContextKey);
        this.publicRuntimeContexts.delete(runtimeContextKey);
        return {
          outcome: 'completed', runId, output,
          sessionId: runtimeContext?.resultSessionId ?? null,
          tokensIn: run.tokensIn, tokensOut: run.tokensOut, elapsedMs: run.elapsedMs ?? Date.now() - startedAt,
        };
      }
      if (run.state === 'FAILED' || run.state === 'CANCELLED') {
        this.publicRuntimeContexts.delete(runtimeContextKey);
        if (run.stopReason === 'deadline') return { outcome: 'degraded', reason: 'timeout' };
        if (run.stopReason === 'quota') return { outcome: 'degraded', reason: 'budget-exceeded' };
        if (run.state === 'CANCELLED') return { outcome: 'degraded', reason: 'user-stopped' };
        return { outcome: 'degraded', reason: 'runtime-error' };
      }
      await new Promise((resolve) => setTimeout(resolve, PUBLIC_RUN_POLL_MS));
    }
  }

  async ownedRun(id: string): Promise<ExecutionRunView> {
    return this.ownedView(id);
  }

  async ownedRuns(cursor: string | undefined, limit = 20, agentId?: string): Promise<{ items: ExecutionRunListItem[]; next: string | null; total: number }> {
    const parsed = parseRunCursor(cursor);
    if (parsed === 'invalid' || (agentId !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(agentId)) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw validationError('游标或数量不正确');
    }
    const before = parsed ? await this.runs.findById(parsed) : null;
    if (parsed && (!before || !this.isOwned(before))) throw validationError('游标或数量不正确');
    const [rows, total] = await Promise.all([
      this.runs.listOwned({
        origin: 'admin', actor: 'owner', agentId,
        before: before ? { createdAt: before.createdAt, id: before.id } : null,
        limit,
      }),
      this.runs.countOwned(agentId),
    ]);
    return {
      items: rows.map((row) => ({ ...viewOf(row), agentId: row.agentId, agentName: row.agentName })),
      next: rows.length === limit ? rows[rows.length - 1].id : null,
      total,
    };
  }

  async ownedEvents(id: string, after: string | undefined): Promise<{ items: ExecutionEventView[]; next: number | null }> {
    await this.ownedView(id);
    const seq = parseEventCursor(after);
    if (seq === null) throw validationError('事件游标不正确');
    const rows = await this.runs.listEvents(id, seq, 50);
    return {
      items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      next: rows.length === 50 ? rows[rows.length - 1].seq : null,
    };
  }

  /**
   * 把已保存的文本事件按助手 SSE 的 text/done 帧写出。
   * 连接断开只停止观察，不停止运行。
   */
  async streamOwned(id: string, signal: AbortSignal, write: (chunk: string) => void): Promise<void> {
    await this.ownedView(id);
    let after = 0;
    let text = '';
    const started = Date.now();
    while (!signal.aborted && Date.now() - started < 130_000) {
      const events = await this.runs.listEvents(id, after, 50);
      for (const event of events) {
        after = event.seq;
        if (event.kind !== 'text' || !event.text) continue;
        text += event.text;
        write(`event: text\ndata: ${JSON.stringify({ delta: event.text })}\n\n`);
      }
      const run = await this.ownedView(id);
      if (run.state === 'SUCCEEDED' || run.state === 'FAILED' || run.state === 'CANCELLED') {
        const event = run.state === 'SUCCEEDED' ? 'done' : 'error';
        const data = run.state === 'SUCCEEDED' ? { answer: text } : { state: run.state, stopReason: run.stopReason };
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  async stopOwned(id: string): Promise<ExecutionRunView> {
    await this.ownedView(id);
    await this.stop(id, 'user');
    return this.ownedView(id);
  }

  private async ownedView(id: string): Promise<ExecutionRunView> {
    const run = await this.runs.findById(id);
    if (!run || !this.isOwned(run)) throw new ApiError('run-not-found', 404, '找不到这条运行记录');
    return viewOf(run);
  }

  private isOwned(run: AgentExecutionRecord): boolean {
    return run.origin === 'admin' && run.actor === 'owner';
  }

  private async follow(runId: string): Promise<void> {
    const run = await this.runs.findById(runId);
    if (!run || run.state !== 'RUNNING' || !run.agentRevisionId || !run.input) return;
    const runtimeContextKey = `${run.actorScope}\n${run.requestKey}`;
    const publicRuntimeContext = run.origin === 'public' ? this.publicRuntimeContexts.get(runtimeContextKey) : null;
    const seen: Array<{ kind: 'text' | 'usage'; text?: string; tokensIn?: number; tokensOut?: number }> = [];
    let eventWrites = Promise.resolve();
    let eventWriteError: unknown = null;
    const queueEvent = (input: Parameters<typeof this.runs.appendEvent>[0]) => {
      eventWrites = eventWrites.then(async () => {
        if (eventWriteError) return;
        try { await this.runs.appendEvent(input); }
        catch (error) { eventWriteError = error; }
      });
    };
    const started = Date.now();
    try {
      // R26：解析该修订属于哪个 Agent，运行时据此用它的独立 home（配置/插件/会话隔离）。
      const located = await this.runs.locateRevision(run.agentRevisionId);
      const result = await this.runtime.run({
        prompt: run.input,
        owner: {
          visitorKey: publicRuntimeContext?.visitorKey ?? run.actor,
          agentRevisionId: run.agentRevisionId,
          agentId: located?.agentId ?? null,
          providerId: located?.providerId ?? null,
          modelId: located?.modelId ?? null,
          // R32：把该修订的系统提示词交给运行时，由它注入 dsh 的 system-prompt persona。
          systemPrompt: located?.prompt ?? null,
        },
        ...(publicRuntimeContext?.sessionId ? { sessionId: publicRuntimeContext.sessionId } : {}),
        ...(publicRuntimeContext?.freshPrompt ? { freshPrompt: publicRuntimeContext.freshPrompt } : {}),
        ...(publicRuntimeContext ? {
          onSessionResource: async (resource: { sessionId: string; kind: 'native-session' | 'native-fork'; parentSessionId?: string | null }) => {
            if (!publicRuntimeContext.conversationId) return;
            const registered = await this.logResources.register({
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
          // 事件**实时落库**（R33）：SSE 观察者（含页面刷新后重连的）随时能查到。
          // 原先攒到 run 结束才批量写，导致 RUNNING 期间 DB 无事件——
          // 任何错过 SSE 的客户端在结束前都看不到任何输出（站主报的「只见输入不见输出」）。
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
      // 实时落库已覆盖 text/usage 的持久化，这里**不再批量补写**——
      // 否则同一批事件会写两遍（实测 events=3、文本重复「OKOK」）。
      const latest = await this.runs.findById(runId);
      if (!latest || latest.state !== 'RUNNING') return;
      if (!result.ok) {
        await this.runs.setStateUnless({
          id: runId, from: ['RUNNING'], to: 'FAILED', epoch: latest.leaseEpoch,
          owner: latest.leaseOwner ?? undefined, stopReason: 'runtime-error',
        });
        return;
      }
      if (result.usage && !seen.some((event) => event.kind === 'usage')) {
        await this.runs.appendEvent({ runId, kind: 'usage', tokensIn: result.usage.inputTokens, tokensOut: result.usage.outputTokens });
      }
      await this.recordResult(runId, result.usage
        ? { tokensIn: result.usage.inputTokens, tokensOut: result.usage.outputTokens, elapsedMs: Date.now() - started }
        : null);
    } catch (error) {
      // 诊断落盘：follow 的 run 失败原先也无日志，必须留现场。
      await eventWrites;
      this.logger.error(`run ${runId} failed: ${describeError(error)}`);
      const latest = await this.runs.findById(runId);
      if (latest?.state === 'RUNNING') {
        await this.runs.setStateUnless({
          id: runId, from: ['RUNNING'], to: 'FAILED', epoch: latest.leaseEpoch,
          owner: latest.leaseOwner ?? undefined, stopReason: 'runtime-error',
        });
      }
    }
  }

  private async isolate(run: AgentExecutionRecord): Promise<StopResult> {
    await this.runs.setStateUnless({
      id: run.id, from: ['STOPPING'], to: 'UNKNOWN', epoch: run.leaseEpoch, owner: run.leaseOwner ?? undefined,
    });
    return { outcome: 'isolated', runId: run.id, reason: '关闭没有完成，模型槽继续占用' };
  }

  private async dispatchOnce(now: Date): Promise<DispatchResult> {
    let decision: DispatchResult | Claimed;
    try {
      decision = await this.journal.transaction(async (tx) => {
        await tx.runs.lockSchedule();
        const queued = await tx.runs.list(['QUEUED'], 100);
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
      // 诊断落盘：dispatch 启动失败原先完全无日志，用户只能看到 FAILED。
      this.logger.error(`runtime start failed: ${describeError(error)}`);
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

  private async admit(
    runs: AgentExecutionRepositoryPort, run: AgentExecutionRecord, grant: AuthorizationGrantView | null, now: Date,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const scope = run.resourceScope;
    const target = scope?.ids[0];
    if (!run.agentRevisionId || !scope || !target) return { ok: false, reason: '当前请求不允许执行' };
    const located = await runs.locateRevision(run.agentRevisionId);
    if (!located || located.archivedAt) return { ok: false, reason: '当前请求不允许执行' };
    const agentActions: AgentAction[] = located.toolProfile?.id === READ_ONLY_PROFILE.id && located.toolProfile.version === READ_ONLY_PROFILE.version
      ? ['agent:run', 'content:read'] : [];
    const principalType = run.origin === 'public' ? 'visitor' : run.origin === 'system' ? 'system' : 'owner';
    let parent: Parameters<typeof executionPolicyAllows>[0]['parent'];
    if (run.parentRunId) {
      const parentRun = await runs.findById(run.parentRunId);
      if (!parentRun || parentRun.state !== 'RUNNING' || parentRun.actor !== run.actor ||
          parentRun.grantId !== run.grantId || (parentRun.deadline && parentRun.deadline <= now) ||
          !grant || !parentRun.resourceScope) return { ok: false, reason: '当前请求不允许执行' };
      parent = { origin: parentRun.origin, principalId: parentRun.actor, actions: grant.actions, scope: parentRun.resourceScope, grantId: parentRun.grantId ?? null };
    }
    const objectActions = await this.objects.actions(scope.kind, target, located.agentId);
    const actions: AgentAction[] = scope.kind === 'content' ? ['agent:run', 'content:read'] : ['agent:run'];
    for (const action of actions) {
      if (!executionPolicyAllows({
        origin: run.origin, principalType, principalId: run.actor, agentId: located.agentId,
        action, resourceKind: scope.kind, resourceId: target, now: now.getTime(),
        agentActions, objectActions, grant, parent,
      })) {
        return { ok: false, reason: denialReason({ expectsGrant: run.origin !== 'public', grant, resourceKind: scope.kind, resourceId: target, now: now.getTime() }) };
      }
    }
    return { ok: true };
  }
}
