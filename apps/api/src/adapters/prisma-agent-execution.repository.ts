import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type ExecutionRun } from '@prisma/client';
import { canTransitionRun, isRunTerminal, SLOT_OCCUPYING_STATES, type RunState } from '@walker/shared';
import { storageUnavailable } from '../common/http-error';
import { PRISMA } from '../ports/prisma.port';
import type {
  AgentExecutionDraft,
  AgentExecutionRecord,
  AgentExecutionRepositoryPort,
} from '../ports/agent-execution.repository';
import { registerLogResource } from './log-resource.writer';

type ExecutionDb = Pick<Prisma.TransactionClient,
  'executionRun' | 'executionSchedule' | 'agentRevision' | 'processRecord' | 'executionEvent' | 'executionQuotaHold' | 'conversationAttempt' | 'conversationLogResource' | 'deletionTombstone'> & {
  $executeRaw: Prisma.TransactionClient['$executeRaw'];
  $queryRawUnsafe: Prisma.TransactionClient['$queryRawUnsafe'];
};

export class IdempotencyConflictError extends Error {
  constructor() { super('同一请求键对应不同执行内容'); }
}

function assertionOf(value: unknown): AgentExecutionRecord['assertion'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as { verdict?: unknown; reason?: unknown };
  if (row.verdict !== 'pass' && row.verdict !== 'fail' && row.verdict !== 'review') return null;
  return { verdict: row.verdict, reason: typeof row.reason === 'string' ? row.reason : '' };
}

function record(row: ExecutionRun): AgentExecutionRecord {
  return {
    id: row.id,
    kind: row.kind,
    origin: row.origin as AgentExecutionRecord['origin'],
    actor: row.actor,
    actorScope: row.actorScope,
    agentRevisionId: row.agentRevisionId,
    deploymentId: row.deploymentId,
    placementKey: row.placementKey,
    deploymentGeneration: row.deploymentGeneration,
    contentSnapshotId: row.contentSnapshotId,
    requestKey: row.requestKey,
    inputHash: row.inputHash,
    resourceScope: row.resourceScope as AgentExecutionRecord['resourceScope'],
    deadline: row.deadline,
    input: row.input,
    parentRunId: row.parentRunId,
    grantId: row.grantId,
    state: row.state as RunState,
    attempt: row.attempt,
    leaseOwner: row.leaseOwner,
    leaseEpoch: row.leaseEpoch,
    leaseUntil: row.leaseUntil,
    stopReason: row.stopReason as AgentExecutionRecord['stopReason'],
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    elapsedMs: row.elapsedMs,
    testCaseId: row.testCaseId,
    suiteVersion: row.suiteVersion,
    configHash: row.configHash,
    assertion: assertionOf(row.assertion),
    legacySource: row.legacySource,
    legacyId: row.legacyId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaAgentExecutionRepository implements AgentExecutionRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: { getClient(): ExecutionDb | null }) {}

  private db() {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    return db;
  }

  /** 进程内按 runId 串行化事件写入的链尾（见 appendEvent 的并发说明）。 */
  private readonly eventChains = new Map<string, Promise<unknown>>();

  /**
   * 把 work 排到 key 的队尾：同 key 的调用严格串行，不同 key 互不阻塞。
   * 队列空闲即从 Map 删除，长生命周期进程不会累积。
   */
  private serializeByKey<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.eventChains.get(key) ?? Promise.resolve();
    const run = previous.then(work, work);
    const tail = run.then(() => undefined, () => undefined);
    this.eventChains.set(key, tail);
    void tail.then(() => {
      if (this.eventChains.get(key) === tail) this.eventChains.delete(key);
    });
    return run;
  }

  private transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const client = this.db() as ExecutionDb & {
      $transaction?: <Result>(
        callback: (tx: Prisma.TransactionClient) => Promise<Result>,
        options?: { maxWait?: number; timeout?: number },
      ) => Promise<Result>;
    };
    // Prisma 交互式事务默认 5s 超时（P2028）。CI 慢 I/O 首跑实测：6 路并发事件写
    // 会顶到该上限，事务在持锁等待中过期——放宽到 15s；重试仍是兜底。
    return client.$transaction
      ? client.$transaction(work, { maxWait: 10_000, timeout: 15_000 })
      : work(client as unknown as Prisma.TransactionClient);
  }

  async submitIfAbsent(draft: AgentExecutionDraft) {
    const { conversationId, ...runDraft } = draft;
    try {
      const row = await this.transaction(async (tx) => {
        const created = await tx.executionRun.create({ data: { ...runDraft, resourceScope: runDraft.resourceScope ?? Prisma.DbNull } });
        await registerLogResource(tx, {
          conversationId: conversationId ?? null,
          resourceType: 'execution-run',
          resourceKey: created.id,
          resourceCreatedAt: created.createdAt,
        });
        return created;
      });
      return { run: record(row), created: true };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const { conversationId: _conversationId, ...expectedDraft } = draft;
      const row = await this.db().executionRun.findUnique({
        where: { actorScope_requestKey: { actorScope: expectedDraft.actorScope, requestKey: expectedDraft.requestKey } },
      });
      if (!row || row.inputHash !== expectedDraft.inputHash || row.kind !== expectedDraft.kind ||
          row.origin !== expectedDraft.origin || row.actor !== expectedDraft.actor ||
          row.agentRevisionId !== expectedDraft.agentRevisionId ||
          row.deploymentId !== (expectedDraft.deploymentId ?? null) ||
          row.placementKey !== (expectedDraft.placementKey ?? null) ||
          row.deploymentGeneration !== (expectedDraft.deploymentGeneration ?? null) ||
          row.contentSnapshotId !== (expectedDraft.contentSnapshotId ?? null) ||
          row.parentRunId !== (expectedDraft.parentRunId ?? null) ||
          row.grantId !== (expectedDraft.grantId ?? null) || JSON.stringify(row.resourceScope) !== JSON.stringify(expectedDraft.resourceScope ?? null)) {
        throw new IdempotencyConflictError();
      }
      return { run: record(row), created: false };
    }
  }

  async claim(id: string, owner: string, now: Date, leaseUntil: Date) {
    if (leaseUntil <= now) throw new Error('租约结束时间必须晚于领取时间');
    const [claimed] = await this.db().executionRun.updateManyAndReturn({
      where: { id, state: 'QUEUED', OR: [{ deadline: null }, { deadline: { gt: now } }] },
      data: { state: 'CLAIMED', leaseOwner: owner, leaseEpoch: { increment: 1 }, leaseUntil },
    });
    return claimed ? record(claimed) : null;
  }

  async renewLease(id: string, owner: string, epoch: number, now: Date, leaseUntil: Date) {
    if (leaseUntil <= now) throw new Error('租约结束时间必须晚于续租时间');
    const changed = await this.db().executionRun.updateMany({
      where: {
        id, leaseOwner: owner, leaseEpoch: epoch,
        state: { in: ['CLAIMED', 'RUNNING'] }, leaseUntil: { gt: now },
      },
      data: { leaseUntil },
    });
    return changed.count === 1;
  }

  async setStateUnless(input: Parameters<AgentExecutionRepositoryPort['setStateUnless']>[0]) {
    if (!input.from.length || input.from.some((state) => !canTransitionRun(state, input.to))) {
      throw new Error('非法执行状态转换');
    }
    const terminal = isRunTerminal(input.to);
    const changed = await this.db().executionRun.updateMany({
      where: {
        id: input.id, state: { in: input.from }, leaseEpoch: input.epoch,
        ...(input.owner === undefined ? {} : { leaseOwner: input.owner }),
      },
      data: {
        state: input.to,
        ...(input.stopReason === undefined ? {} : { stopReason: input.stopReason }),
        ...(input.tokensIn === undefined ? {} : { tokensIn: input.tokensIn }),
        ...(input.tokensOut === undefined ? {} : { tokensOut: input.tokensOut }),
        ...(input.elapsedMs === undefined ? {} : { elapsedMs: input.elapsedMs }),
        ...(terminal ? { leaseOwner: null, leaseUntil: null } : {}),
      },
    });
    return changed.count === 1;
  }

  async findById(id: string) {
    const row = await this.db().executionRun.findUnique({ where: { id } });
    return row ? record(row) : null;
  }

  async findByRequest(actorScope: string, requestKey: string) {
    const row = await this.db().executionRun.findUnique({ where: { actorScope_requestKey: { actorScope, requestKey } } });
    return row ? record(row) : null;
  }

  async countWaiting(lane: Parameters<AgentExecutionRepositoryPort['countWaiting']>[0], now: Date) {
    return this.db().executionRun.count({
      where: {
        state: 'QUEUED',
        origin: { in: lane === 'public' ? ['public'] : ['admin', 'system'] },
        OR: [{ deadline: null }, { deadline: { gt: now } }],
      },
    });
  }

  countOccupying() {
    return this.db().executionRun.count({ where: { state: { in: [...SLOT_OCCUPYING_STATES] } } });
  }

  async lockSchedule() {
    await this.db().$queryRawUnsafe('PRAGMA busy_timeout = 5000');
    await this.db().$executeRaw`
      INSERT INTO "ExecutionSchedule" ("id", "consecutivePublicClaims") VALUES ('global', 0)
      ON CONFLICT("id") DO UPDATE SET "consecutivePublicClaims" = "consecutivePublicClaims"
    `;
  }

  async streak() {
    const row = await this.db().executionSchedule.findUnique({ where: { id: 'global' } });
    return row?.consecutivePublicClaims ?? 0;
  }

  async setStreak(value: number) {
    await this.db().executionSchedule.update({ where: { id: 'global' }, data: { consecutivePublicClaims: value } });
  }

  async locateRevision(revisionId: string) {
    const row = await this.db().agentRevision.findUnique({ where: { id: revisionId }, include: { agent: true } });
    if (!row) return null;
    const profile = row.toolProfile;
    const toolProfile = profile && typeof profile === 'object' && !Array.isArray(profile)
      ? { id: typeof profile.id === 'string' ? profile.id : undefined, version: typeof profile.version === 'number' ? profile.version : undefined }
      : null;
    return { agentId: row.agentId, archivedAt: row.agent.archivedAt, toolProfile, prompt: row.prompt, providerId: row.providerId, modelId: row.modelId };
  }

  async list(states: RunState[], limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('列表上限必须在 1–100 之间');
    const rows = await this.db().executionRun.findMany({
      where: { state: { in: states } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(record);
  }

  async recordProcess(input: { runId: string; bootId: string; pid: number | null; startedAt: string | null }) {
    await this.db().processRecord.upsert({
      where: { runId: input.runId },
      create: input,
      update: { bootId: input.bootId, pid: input.pid, startedAt: input.startedAt },
    });
  }

  async readProcess(runId: string) {
    return this.db().processRecord.findUnique({ where: { runId } });
  }

  async listOwned(input: { origin: 'admin'; actor: string; agentId?: string; before: { createdAt: Date; id: string } | null; limit: number }) {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) throw new Error('列表上限必须在 1–50 之间');
    const rows = await this.db().executionRun.findMany({
      where: this.ownedWhere(input.agentId, input.before),
      include: { agentRevision: { include: { agent: { select: { name: true } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
    });
    return rows.map((row) => ({
      ...record(row),
      agentId: row.agentRevision?.agentId ?? null,
      agentName: row.agentRevision?.agent.name ?? null,
    }));
  }

  async markTest(id: string, input: { testCaseId: string; suiteVersion: number; configHash: string; assertion: { verdict: 'pass' | 'fail' | 'review'; reason: string } }) {
    await this.db().executionRun.update({ where: { id }, data: input });
  }

  async listTests(revisionId: string) {
    const rows = await this.db().executionRun.findMany({
      where: { agentRevisionId: revisionId, kind: 'test' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(record);
  }

  async markRetention(id: string, input: { retainUntil: Date; diagnosticName: string }) {
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(input.diagnosticName) || input.diagnosticName.includes('..')) throw new Error('invalid-diagnostic');
    await this.db().executionRun.update({ where: { id }, data: input });
  }

  async listExpiredAdmin(now: Date) {
    const rows = await this.db().executionRun.findMany({
      where: { origin: 'admin', retainUntil: { lt: now } },
      select: { id: true, diagnosticName: true },
    });
    return rows;
  }

  async deleteExpiredAdmin(id: string, now: Date) {
    return this.transaction(async (tx) => {
      const row = await tx.executionRun.findUnique({ where: { id } });
      if (!row || row.origin !== 'admin' || !row.retainUntil || row.retainUntil >= now) return false;
      await tx.executionEvent.deleteMany({ where: { runId: id } });
      await tx.processRecord.deleteMany({ where: { runId: id } });
      await tx.executionQuotaHold.deleteMany({ where: { runId: id } });
      await tx.conversationLogResource.deleteMany({
        where: { OR: [
          { resourceType: 'execution-run', resourceKey: id },
          { resourceType: 'execution-event', parentKey: id },
        ] },
      });
      await tx.executionRun.delete({ where: { id } });
      return true;
    });
  }

  countOwned(agentId?: string) {
    return this.db().executionRun.count({ where: this.ownedWhere(agentId, null) });
  }

  private ownedWhere(agentId: string | undefined, before: { createdAt: Date; id: string } | null) {
    return {
      origin: 'admin' as const,
      actor: 'owner',
      ...(agentId ? { agentRevision: { is: { agentId } } } : {}),
      ...(before ? {
        OR: [
          { createdAt: { lt: before.createdAt } },
          { createdAt: before.createdAt, id: { lt: before.id } },
        ],
      } : {}),
    };
  }

  /**
   * 追加一条事件（seq 自增）。
   *
   * 并发安全（R33）：事件有两个写入方——运行中观察回调实时写、结束时 follow 按 seen
   * 批量补写。并发时两边会读到同一个最大 seq 并撞 `@@unique([runId, seq])`。
   * 原实现直接抛 Prisma 错误，把一次**成功的运行**标成 FAILED。
   * 现在：撞键时**用下一个 seq 重试**，保证事件不丢；重试有上限防死循环。
   * CI 首跑实证补充：慢 I/O 下并发写还会撞 SQLite 瞬态错误（P2024 锁 / P2028 事务过期 /
   * P1008 应答超时），与唯一键冲突同属本契约下的可重试项；重试间加小退避，避免忙等。
   *
   * 进一步根治（CI 二跑实证 P1008）：同进程内的两个写入方按 runId **串行排队**——
   * 生产是单 Nest 进程（实时写 + 批量补写同进程），串行后既不撞 seq 也不互等写锁；
   * 下面的重试循环因此降级为跨进程/异常场景的兜底。
   */
  async appendEvent(input: { runId: string; kind: 'text' | 'usage'; text?: string | null; tokensIn?: number | null; tokensOut?: number | null }) {
    return this.serializeByKey(input.runId, () => this.appendEventOnce(input));
  }

  private async appendEventOnce(input: { runId: string; kind: 'text' | 'usage'; text?: string | null; tokensIn?: number | null; tokensOut?: number | null }) {
    const maxAttempts = 12;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // 小退避 + 抖动：让并发的另一个写入者先落地，降低再次相撞的概率。
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 5 * attempt + Math.floor(Math.random() * 15)));
      const last = await this.db().executionEvent.findFirst({ where: { runId: input.runId }, orderBy: { seq: 'desc' } });
      const seq = (last?.seq ?? 0) + 1;
      try {
        await this.transaction(async (tx) => {
          const event = await tx.executionEvent.create({
            data: {
              id: `${input.runId}:${seq}`, runId: input.runId, seq, kind: input.kind,
              text: input.text ?? null, tokensIn: input.tokensIn ?? null, tokensOut: input.tokensOut ?? null,
            },
          });
          const owner = await tx.conversationLogResource.findUnique({
            where: { resourceType_resourceKey: { resourceType: 'execution-run', resourceKey: input.runId } },
            select: { conversationId: true },
          });
          if (owner) {
            await registerLogResource(tx, {
              conversationId: owner.conversationId,
              resourceType: 'execution-event',
              resourceKey: event.id,
              parentKey: input.runId,
              resourceCreatedAt: event.createdAt,
            }, { allowActiveRunDrain: true });
          }
        });
        return seq;
      } catch (error) {
        // 可重试的三类瞬态错误：①唯一键冲突（另一路写入推进了 seq）；
        // ②SQLite 锁/连接池瞬态；③交互式事务过期/超时（P2028）。其余错误照常抛出。
        const message = error instanceof Error ? error.message : String(error);
        const retryable = /unique|Unique|P2002/.test(message)
          || /locked|busy|P2024|P2034|P1008|Socket timeout/i.test(message)
          || /P2028|Transaction already closed|Transaction API error|expired transaction/i.test(message);
        if (!retryable || attempt === maxAttempts - 1) throw error;
      }
    }
    throw new Error(`appendEvent: seq 冲突重试耗尽（runId=${input.runId}）`);
  }

  async listEvents(runId: string, after: number, limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('事件上限必须在 1–100 之间');
    const rows = await this.db().executionEvent.findMany({
      where: { runId, seq: { gt: after } },
      orderBy: { seq: 'asc' },
      take: limit,
    });
    return rows.map((row) => ({
      seq: row.seq,
      kind: row.kind === 'usage' ? 'usage' as const : 'text' as const,
      text: row.text,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      createdAt: row.createdAt,
    }));
  }

  async listRecoverable() {
    const rows = await this.db().executionRun.findMany({
      where: { state: { in: ['CLAIMED', 'RUNNING', 'STOPPING', 'UNKNOWN'] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(record);
  }
}
