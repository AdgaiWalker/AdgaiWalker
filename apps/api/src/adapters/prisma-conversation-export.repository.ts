import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newId } from '../common/ids';
import { storageUnavailable } from '../common/http-error';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import type {
  ConversationExportRepositoryPort,
  ConversationExportRecord,
  CreateConversationExport,
} from '../ports/conversation-export.repository';
import { CONVERSATION_EXPORT_TTL_MS } from '../log-resources/conversation-export.policy';

const EMPTY_FILTERS = { from: null, to: null, contentSlug: null, placementKey: null, agentId: null, runState: null, keyword: null };
const RESOURCE_TYPE = 'export';

@Injectable()
export class PrismaConversationExportRepository implements ConversationExportRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    return db;
  }

  async create(input: CreateConversationExport): Promise<ConversationExportRecord> {
    const db = this.db();
    return db.$transaction(async (tx) => {
      await tx.conversationExportJob.create({
        data: {
          id: input.id,
          format: input.format,
          status: 'QUEUED',
          filters: input.filters as Prisma.InputJsonValue,
          snapshotAt: input.snapshotAt,
          retentionCutoff: input.retentionCutoff,
        },
      });

      for (const ids of chunks(input.conversationIds, 400)) {
        const active = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT c."id" AS "id"
          FROM "Conversation" c
          WHERE c."id" IN (${Prisma.join(ids)})
            AND c."createdAt" >= ${input.retentionCutoff}
            AND NOT EXISTS (
              SELECT 1 FROM "DeletionTombstone" d WHERE d."conversationId" = c."id"
            )
        `);
        if (active.length === 0) continue;
        await tx.conversationLogResource.createMany({
          data: active.map(({ id }) => ({
            id: newId(),
            conversationId: id,
            resourceType: RESOURCE_TYPE,
            resourceKey: `${input.id}/${id}`,
            parentKey: input.id,
            resourceCreatedAt: input.snapshotAt,
            registeredAt: input.snapshotAt,
          })),
        });
      }

      const rowCount = await tx.conversationLogResource.count({ where: { resourceType: RESOURCE_TYPE, parentKey: input.id } });
      const job = await tx.conversationExportJob.update({ where: { id: input.id }, data: { rowCount } });
      await tx.auditRecord.create({
        data: {
          id: newId(), actor: 'owner', action: 'conversation-export-requested',
          targetType: 'conversation-export', targetId: input.id, outcome: 'queued',
        },
      });
      return asRecord(job);
    });
  }

  async find(id: string): Promise<ConversationExportRecord | null> {
    const row = await this.db().conversationExportJob.findUnique({ where: { id } });
    return row ? asRecord(row) : null;
  }

  pendingIds(now: Date, limit: number): Promise<string[]> {
    return this.db().conversationExportJob.findMany({
      where: { status: 'QUEUED', snapshotAt: { gt: beforeExpiry(now) } },
      select: { id: true }, orderBy: [{ snapshotAt: 'asc' }, { id: 'asc' }], take: bounded(limit),
    }).then((rows) => rows.map(({ id }) => id));
  }

  async snapshotConversationIds(exportId: string): Promise<string[]> {
    const rows = await this.db().conversationLogResource.findMany({
      where: { resourceType: RESOURCE_TYPE, parentKey: exportId, conversationId: { not: null } },
      select: { conversationId: true }, orderBy: [{ resourceCreatedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.flatMap(({ conversationId }) => conversationId ? [conversationId] : []);
  }

  async claim(id: string): Promise<ConversationExportRecord | null> {
    const now = new Date();
    const changed = await this.db().conversationExportJob.updateMany({
      where: { id, status: 'QUEUED', snapshotAt: { gt: beforeExpiry(now) } },
      data: { status: 'PROCESSING', errorCode: null },
    });
    return changed.count === 1 ? this.find(id) : null;
  }

  async complete(id: string, now: Date): Promise<boolean> {
    return this.db().$transaction(async (tx) => {
      const job = await tx.conversationExportJob.findUnique({ where: { id } });
      if (!job || job.status !== 'PROCESSING') return false;
      if (isExpired(job.snapshotAt, now)) return false;
      const registered = await tx.conversationLogResource.count({ where: { resourceType: RESOURCE_TYPE, parentKey: id } });
      const blocked = await tx.$queryRaw<Array<{ count: number | bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS "count"
        FROM "ConversationLogResource" r
        LEFT JOIN "DeletionTombstone" d ON d."conversationId" = r."conversationId"
        WHERE r."resourceType" = ${RESOURCE_TYPE} AND r."parentKey" = ${id}
          AND (r."conversationId" IS NULL OR d."id" IS NOT NULL)
      `);
      if (registered !== job.rowCount || Number(blocked[0]?.count ?? 0) > 0) {
        await tx.conversationExportJob.update({ where: { id }, data: { status: 'REVOKED', errorCode: 'conversation-deleted', filters: EMPTY_FILTERS } });
        await tx.auditRecord.create({
          data: { id: newId(), actor: 'system', action: 'conversation-export-revoked', targetType: 'conversation-export', targetId: id, outcome: 'conversation-deleted' },
        });
        return false;
      }
      await tx.conversationExportJob.update({ where: { id }, data: { status: 'READY', errorCode: null } });
      return true;
    });
  }

  async fail(id: string, errorCode: string): Promise<void> {
    await this.db().$transaction(async (tx) => {
      const changed = await tx.conversationExportJob.updateMany({
        where: { id, status: { in: ['PROCESSING', 'READY'] } }, data: { status: 'FAILED', errorCode },
      });
      if (changed.count === 0) return;
      await tx.auditRecord.create({
        data: { id: newId(), actor: 'system', action: 'conversation-export-failed', targetType: 'conversation-export', targetId: id, outcome: errorCode },
      });
    });
  }

  async revoke(id: string, reason: 'conversation-deleted'): Promise<void> {
    await this.db().$transaction(async (tx) => {
      const job = await tx.conversationExportJob.findUnique({ where: { id } });
      if (job && job.status !== 'REVOKED') {
        await tx.conversationExportJob.update({
          where: { id }, data: { status: 'REVOKED', errorCode: reason, filters: EMPTY_FILTERS },
        });
        await tx.auditRecord.create({
          data: { id: newId(), actor: 'system', action: 'conversation-export-revoked', targetType: 'conversation-export', targetId: id, outcome: reason },
        });
      }
      await tx.conversationLogResource.deleteMany({ where: { resourceType: RESOURCE_TYPE, parentKey: id } });
    });
  }

  async expire(id: string, now: Date): Promise<void> {
    await this.db().$transaction((tx) => expireWithin(tx, id, now));
  }

  expiredIds(now: Date, limit: number): Promise<string[]> {
    return this.db().conversationExportJob.findMany({
      where: { snapshotAt: { lte: beforeExpiry(now) }, status: { notIn: ['EXPIRED', 'REVOKED'] } },
      select: { id: true }, orderBy: [{ snapshotAt: 'asc' }, { id: 'asc' }], take: bounded(limit),
    }).then((rows) => rows.map(({ id }) => id));
  }

  readyArtifacts(now: Date): Promise<Array<{ id: string; format: ConversationExportRecord['format'] }>> {
    return this.db().conversationExportJob.findMany({
      where: { status: 'READY', snapshotAt: { gt: beforeExpiry(now) } },
      select: { id: true, format: true },
    }).then((rows) => rows.map((row) => ({ id: row.id, format: row.format as ConversationExportRecord['format'] })));
  }

  async requeueInterrupted(): Promise<void> {
    await this.db().conversationExportJob.updateMany({
      where: { status: 'PROCESSING', snapshotAt: { gt: beforeExpiry(new Date()) } }, data: { status: 'QUEUED', errorCode: null },
    });
  }

  async recordDownload(id: string, now: Date): Promise<ConversationExportRecord['status'] | 'MISSING'> {
    return this.db().$transaction(async (tx) => {
      const job = await tx.conversationExportJob.findUnique({ where: { id } });
      if (!job) return 'MISSING';
      if (isExpired(job.snapshotAt, now) && job.status !== 'EXPIRED' && job.status !== 'REVOKED') {
        return 'EXPIRED';
      }
      if (job.status !== 'READY') return job.status as ConversationExportRecord['status'];
      const registered = await tx.conversationLogResource.count({ where: { resourceType: RESOURCE_TYPE, parentKey: id } });
      const blocked = await tx.$queryRaw<Array<{ count: number | bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS "count"
        FROM "ConversationLogResource" r
        LEFT JOIN "DeletionTombstone" d ON d."conversationId" = r."conversationId"
        WHERE r."resourceType" = ${RESOURCE_TYPE} AND r."parentKey" = ${id}
          AND (r."conversationId" IS NULL OR d."id" IS NOT NULL)
      `);
      if (registered !== job.rowCount || Number(blocked[0]?.count ?? 0) > 0) {
        return 'REVOKED';
      }
      await tx.auditRecord.create({
        data: { id: newId(), actor: 'owner', action: 'conversation-export-download-authorized', targetType: 'conversation-export', targetId: id, outcome: 'authorized' },
      });
      return 'READY';
    });
  }
}

async function expireWithin(tx: Prisma.TransactionClient, id: string, now: Date): Promise<void> {
  const job = await tx.conversationExportJob.findUnique({ where: { id } });
  if (!job || job.status === 'EXPIRED' || job.status === 'REVOKED' || !isExpired(job.snapshotAt, now)) return;
  await tx.conversationExportJob.update({ where: { id }, data: { status: 'EXPIRED', errorCode: null, filters: EMPTY_FILTERS } });
  await tx.conversationLogResource.deleteMany({ where: { resourceType: RESOURCE_TYPE, parentKey: id } });
  await tx.auditRecord.create({
    data: { id: newId(), actor: 'system', action: 'conversation-export-expired', targetType: 'conversation-export', targetId: id, outcome: now.toISOString() },
  });
}

function asRecord(row: {
  id: string; format: string; status: string; filters: Prisma.JsonValue; snapshotAt: Date; retentionCutoff: Date;
  rowCount: number; errorCode: string | null;
}): ConversationExportRecord {
  return {
    ...row,
    format: row.format as ConversationExportRecord['format'],
    status: row.status as ConversationExportRecord['status'],
    filters: row.filters as ConversationExportRecord['filters'],
  };
}

function beforeExpiry(now: Date): Date {
  return new Date(now.getTime() - CONVERSATION_EXPORT_TTL_MS);
}

function isExpired(snapshotAt: Date, now: Date): boolean {
  return snapshotAt.getTime() + CONVERSATION_EXPORT_TTL_MS <= now.getTime();
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function bounded(limit: number): number {
  return Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 1_000) : 1_000;
}
