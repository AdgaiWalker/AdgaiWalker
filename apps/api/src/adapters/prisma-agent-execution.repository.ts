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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type ExecutionDb = Pick<Prisma.TransactionClient, 'executionRun' | 'executionSchedule' | 'agentRevision' | 'processRecord' | 'executionEvent' | 'executionQuotaHold'> & {
  $executeRaw: Prisma.TransactionClient['$executeRaw'];
  $queryRawUnsafe: Prisma.TransactionClient['$queryRawUnsafe'];
};

@Injectable()
export class PrismaAgentExecutionRepository implements AgentExecutionRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: {
    getClient(): ExecutionDb | null;
  }) {}

  private db() {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    return db;
  }

  async submitIfAbsent(draft: AgentExecutionDraft) {
    try {
      const row = await this.db().executionRun.create({ data: { ...draft, resourceScope: draft.resourceScope ?? Prisma.DbNull } });
      return { run: record(row), created: true };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const row = await this.db().executionRun.findUnique({
        where: { actorScope_requestKey: { actorScope: draft.actorScope, requestKey: draft.requestKey } },
      });
      if (!row || row.inputHash !== draft.inputHash || row.kind !== draft.kind ||
          row.origin !== draft.origin || row.actor !== draft.actor ||
          row.agentRevisionId !== draft.agentRevisionId ||
          row.parentRunId !== (draft.parentRunId ?? null) ||
          row.grantId !== (draft.grantId ?? null) || JSON.stringify(row.resourceScope) !== JSON.stringify(draft.resourceScope ?? null)) {
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
    return { agentId: row.agentId, archivedAt: row.agent.archivedAt, toolProfile };
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
    const row = await this.db().executionRun.findUnique({ where: { id } });
    if (!row || row.origin !== 'admin' || !row.retainUntil || row.retainUntil >= now) return false;
    await this.db().executionEvent.deleteMany({ where: { runId: id } });
    await this.db().processRecord.deleteMany({ where: { runId: id } });
    await this.db().executionQuotaHold.deleteMany({ where: { runId: id } });
    await this.db().executionRun.delete({ where: { id } });
    return true;
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

  async appendEvent(input: { runId: string; kind: 'text' | 'usage'; text?: string | null; tokensIn?: number | null; tokensOut?: number | null }) {
    const last = await this.db().executionEvent.findFirst({ where: { runId: input.runId }, orderBy: { seq: 'desc' } });
    const seq = (last?.seq ?? 0) + 1;
    await this.db().executionEvent.create({
      data: {
        id: `${input.runId}:${seq}`, runId: input.runId, seq, kind: input.kind,
        text: input.text ?? null, tokensIn: input.tokensIn ?? null, tokensOut: input.tokensOut ?? null,
      },
    });
    return seq;
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
