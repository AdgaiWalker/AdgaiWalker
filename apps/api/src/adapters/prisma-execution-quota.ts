import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { storageUnavailable } from '../common/http-error';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import type { ExecutionQuotaPort, ReserveResult } from '../ports/execution-quota.port';

function oneRow(value: unknown): boolean {
  return value === 1 || value === 1n;
}

function asDatabaseFailure(error: unknown): never {
  if (error instanceof Error && /database is locked|SQLITE_BUSY/i.test(error.message)) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError ||
      error instanceof Prisma.PrismaClientInitializationError ||
      error instanceof Prisma.PrismaClientRustPanicError) throw storageUnavailable();
  throw error;
}

@Injectable()
export class PrismaExecutionQuota implements ExecutionQuotaPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  async reserve(client: object, runId: string, grantId: string | null): Promise<ReserveResult> {
    if (!grantId) return 'uncharged';
    const db = client as Prisma.TransactionClient;
    try {
      const existing = await db.executionQuotaHold.findUnique({ where: { runId } });
      if (existing?.state === 'reserved') return 'held';
      if (existing?.state === 'charged') return 'charged';
      if (existing) return 'released';
      const changed = await db.$executeRaw`
        UPDATE "AuthorizationGrant"
        SET "runsReserved" = "runsReserved" + 1
        WHERE "id" = ${grantId}
          AND "revokedAt" IS NULL
          AND ("runLimit" IS NULL OR "runsReserved" + "runsCharged" < "runLimit")
          AND ("usageLimit" IS NULL OR "usageReserved" + "usageCharged" < "usageLimit")
      `;
      if (!oneRow(changed)) return 'exhausted';
      await db.executionQuotaHold.create({ data: { runId, grantId, state: 'reserved', usage: 0 } });
      return 'reserved';
    } catch (error) {
      asDatabaseFailure(error);
    }
  }

  async settle(runId: string): Promise<'charged' | 'unchanged'> {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    try {
      return await db.$transaction(async (tx) => {
        const hold = await tx.executionQuotaHold.findUnique({ where: { runId } });
        if (!hold || hold.state !== 'reserved') return 'unchanged';
        const changed = await tx.$executeRaw`
          UPDATE "AuthorizationGrant"
          SET "runsReserved" = "runsReserved" - 1, "runsCharged" = "runsCharged" + 1
          WHERE "id" = ${hold.grantId} AND "runsReserved" > 0
        `;
        if (!oneRow(changed)) return 'unchanged';
        const marked = await tx.executionQuotaHold.updateMany({ where: { runId, state: 'reserved' }, data: { state: 'charged' } });
        if (marked.count !== 1) throw new Error('额度结算冲突');
        return 'charged';
      });
    } catch (error) {
      asDatabaseFailure(error);
    }
  }

  /**
   * token 终态记账。同一条运行只记一次（hold.usage 从 0 变成实际值就是"已记"），
   * 所以重试、重复调用都不会重复扣。
   */
  async recordUsage(runId: string, tokens: number): Promise<void> {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    const amount = Number.isFinite(tokens) && tokens > 0 ? Math.floor(tokens) : 0;
    if (amount === 0) return;
    try {
      await db.$transaction(async (tx) => {
        const hold = await tx.executionQuotaHold.findUnique({ where: { runId } });
        if (!hold || hold.usage !== 0) return;
        const marked = await tx.executionQuotaHold.updateMany({ where: { runId, usage: 0 }, data: { usage: amount } });
        if (marked.count !== 1) return;
        await tx.$executeRaw`
          UPDATE "AuthorizationGrant"
          SET "usageCharged" = "usageCharged" + ${amount}
          WHERE "id" = ${hold.grantId}
        `;
      });
    } catch (error) {
      asDatabaseFailure(error);
    }
  }

  async release(runId: string): Promise<void> {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    try {
      await db.$transaction(async (tx) => {
        const hold = await tx.executionQuotaHold.findUnique({ where: { runId } });
        if (!hold || hold.state !== 'reserved') return;
        const changed = await tx.$executeRaw`
          UPDATE "AuthorizationGrant"
          SET "runsReserved" = "runsReserved" - 1
          WHERE "id" = ${hold.grantId} AND "runsReserved" > 0
        `;
        if (!oneRow(changed)) throw new Error('额度释放冲突');
        await tx.executionQuotaHold.updateMany({ where: { runId, state: 'reserved' }, data: { state: 'released' } });
      });
    } catch (error) {
      asDatabaseFailure(error);
    }
  }
}
