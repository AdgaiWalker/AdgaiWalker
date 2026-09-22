import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  admissionDeadline, denialReason, executionPolicyAllows, nextPublicStreak, parseEventCursor,
  parseExecutionRunRequest, parseExecutionSubmit, parseRunCursor,
  queueAdmission, queueLane, READ_ONLY_PROFILE, recoveryDisposition, selectClaim, slotOccupied, stopOutcome,
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


const LEASE_MS = 30_000;

/** 此上下文由鉴权/会话/调度器构造，绝不能从请求体展开。 */
export type ExecutionContext = {
  origin: RunOrigin; principalType: 'owner' | 'visitor' | 'system'; principalId: string;
  agentId: string; grantId: string | null; parentRunId?: string;
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
export class AgentExecutionService implements OnModuleInit {
  private readonly stopping = new Map<string, Promise<StopResult>>();
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
  ) {}

  async onModuleInit() {
    this.lastRecovery = await this.recover();
  }

  /** 调度入队前的策略检查。本身不写队列，也不启动模型。 */
  async preflight(raw: unknown, context: ExecutionContext, now = new Date()) {
    const input = parseExecutionSubmit(raw);
    if (!input) throw validationError('运行请求字段无效');
    const denied = () => new ApiError('execution-denied', 403, '当前请求不允许执行');
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
        input: checked.input.input, resourceScope: checked.resourceScope, deadline: new Date(deadline),
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
   */
  async recordResult(runId: string, usage: { tokensIn: number; tokensOut: number; elapsedMs: number } | null): Promise<boolean> {
    const run = await this.runs.findById(runId);
    if (!run || run.state !== 'RUNNING') return false;
    return this.runs.setStateUnless({
      id: runId, from: ['RUNNING'], to: 'SUCCEEDED', epoch: run.leaseEpoch, owner: run.leaseOwner ?? undefined,
      ...(usage ? usage : {}),
    });
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
    const seen: Array<{ kind: 'text' | 'usage'; text?: string; tokensIn?: number; tokensOut?: number }> = [];
    const started = Date.now();
    try {
      const result = await this.runtime.run({
        prompt: run.input,
        owner: { visitorKey: run.actor, agentRevisionId: run.agentRevisionId },
        observe: (event) => {
          if (event.kind === 'text' && event.text) seen.push({ kind: 'text', text: event.text });
          if (event.kind === 'usage' && event.usage) seen.push({ kind: 'usage', tokensIn: event.usage.inputTokens, tokensOut: event.usage.outputTokens });
        },
      });
      for (const event of seen) await this.runs.appendEvent({ runId, ...event });
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
    } catch {
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
      await this.runtime.start();
    } catch {
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
