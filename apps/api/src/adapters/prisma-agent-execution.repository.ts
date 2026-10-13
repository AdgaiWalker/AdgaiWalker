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

  private transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const client = this.db() as ExecutionDb & {
      $transaction?: <Result>(callback: (tx: Prisma.TransactionClient) => Promise<Result>) => Promise<Result>;
    };
    return client.$transaction ? client.$transaction(work) : work(client as unknown as Prisma.TransactionClient);
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
   */
  async appendEvent(input: { runId: string; kind: 'text' | 'usage'; text?: string | null; tokensIn?: number | null; tokensOut?: number | null }) {
    const maxAttempts = 6;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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
        // 只在唯一键冲突时重试（另一路写入推进了 seq）；其余错误照常抛出。
        const message = error instanceof Error ? error.message : String(error);
        if (!/unique|Unique|P2002/.test(message) || attempt === maxAttempts - 1) throw error;
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
