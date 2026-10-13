import { PrismaAuthorizationRepository } from './prisma-authorization.repository';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { storageUnavailable } from '../common/http-error';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import type { OperationsJournalPort, OperationsTransaction, OutboxEvent } from '../ports/operations-journal.port';
import { PrismaAgentExecutionRepository } from './prisma-agent-execution.repository';
import { PrismaContentReleaseRepository } from './prisma-content-release.repository';

function transactionView(db: Prisma.TransactionClient): OperationsTransaction {
  return {
    client: db,
    runs: new PrismaAgentExecutionRepository({ getClient: () => db }),
    grants: new PrismaAuthorizationRepository({ getClient: () => db }),
    releases: new PrismaContentReleaseRepository({ getClient: () => db }),
    async appendAudit(entry) { await db.auditRecord.create({ data: entry }); },
    async enqueue(event) { await db.outbox.create({ data: event }); },
    async claimOutbox(id, attempt, now) {
      const [event] = await db.outbox.updateManyAndReturn({
        where: { id, attempt, deliveredAt: null, deadAt: null, nextAt: { lte: now } },
        data: { attempt: { increment: 1 } },
      });
      return event ?? null;
    },
    async deliverOutbox(id, attempt, now) {
      const changed = await db.outbox.updateMany({
        where: { id, attempt, deliveredAt: null, deadAt: null },
        data: { deliveredAt: now, lastError: null },
      });
      if (changed.count !== 1) throw new Error('Outbox 投递状态发生冲突');
    },
    async ensureDeletionTombstone(id, conversationId) {
      const existing = await db.deletionTombstone.findUnique({ where: { conversationId } });
      if (existing) return { tombstone: existing, created: false };
      const tombstone = await db.deletionTombstone.create({ data: { id, conversationId } });
      return { tombstone, created: true };
    },
  };
}

function bounded(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('查询上限必须为 1–100');
  return limit;
}

@Injectable()
export class PrismaOperationsJournal implements OperationsJournalPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}
  private db() {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    return db;
  }
  transaction<T>(work: (transaction: OperationsTransaction) => Promise<T>): Promise<T> {
    return this.db().$transaction((tx) => work(transactionView(tx)));
  }
  pending(now: Date, limit: number) {
    return this.db().outbox.findMany({
      where: { deliveredAt: null, deadAt: null, nextAt: { lte: now } },
      orderBy: [{ nextAt: 'asc' }, { id: 'asc' }], take: bounded(limit),
    });
  }
  async fail(event: OutboxEvent, now: Date, errorCode: string) {
    const attempt = event.attempt + 1;
    await this.db().outbox.updateMany({
      where: { id: event.id, attempt: event.attempt, deliveredAt: null, deadAt: null },
      data: {
        attempt, lastError: errorCode,
        nextAt: new Date(now.getTime() + Math.min(60_000, 1_000 * 2 ** (attempt - 1))),
        ...(attempt >= 5 ? { deadAt: now } : {}),
      },
    });
  }
  deadLetters(limit: number) {
    return this.db().outbox.findMany({ where: { deadAt: { not: null } }, orderBy: { deadAt: 'desc' }, take: bounded(limit) });
  }
  auditTrail(targetType: string, targetId: string, limit: number) {
    return this.db().auditRecord.findMany({
      where: { targetType, targetId }, orderBy: { createdAt: 'desc' }, take: bounded(limit),
    });
  }
}
