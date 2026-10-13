import { Inject, Injectable } from '@nestjs/common';
import { storageUnavailable } from '../common/http-error';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import type { DeletionTombstoneRecord, LogResourceInput, LogResourceRepositoryPort, LogResourceRecord, LogRetentionPolicy } from '../ports/log-resource.repository';
import { registerLogResource } from './log-resource.writer';

@Injectable()
export class PrismaLogResourceRepository implements LogResourceRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    return db;
  }

  async register(input: LogResourceInput): Promise<void> {
    const { allowDuringDeletion, ...resource } = input;
    await this.db().$transaction((tx) => registerLogResource(tx, resource, {
      allowResourceDuringDeletion: allowDuringDeletion,
    }));
  }

  find(resourceType: string, resourceKey: string): Promise<LogResourceRecord | null> {
    return this.db().conversationLogResource.findUnique({
      where: { resourceType_resourceKey: { resourceType, resourceKey } },
    });
  }

  forConversation(conversationId: string): Promise<LogResourceRecord[]> {
    return this.db().conversationLogResource.findMany({
      where: { conversationId },
      orderBy: [{ resourceCreatedAt: 'asc' }, { id: 'asc' }],
    });
  }

  expired(input: { detailBefore: Date; aggregateBefore: Date; limit: number }): Promise<LogResourceRecord[]> {
    return this.db().conversationLogResource.findMany({
      where: {
        OR: [
          { resourceType: 'daily-aggregate', resourceCreatedAt: { lte: input.aggregateBefore } },
          { resourceType: { notIn: ['daily-aggregate', 'export'] }, resourceCreatedAt: { lte: input.detailBefore } },
        ],
      },
      orderBy: [{ resourceCreatedAt: 'asc' }, { id: 'asc' }],
      take: input.limit,
    });
  }

  async getPolicy(): Promise<LogRetentionPolicy> {
    const row = await this.db().logRetentionPolicy.findUnique({ where: { id: 'site' } });
    return row ?? { id: 'site', detailRetentionDays: 90, aggregateRetentionDays: 365, updatedAt: new Date(0) };
  }

  async updatePolicy(input: { detailRetentionDays: number; aggregateRetentionDays: number }): Promise<LogRetentionPolicy> {
    return this.db().logRetentionPolicy.upsert({
      where: { id: 'site' },
      create: { id: 'site', ...input },
      update: input,
    });
  }

  async hasDeletionTombstone(conversationId: string): Promise<boolean> {
    return Boolean(await this.db().deletionTombstone.findUnique({ where: { conversationId }, select: { id: true } }));
  }

  tombstoneForConversation(conversationId: string): Promise<DeletionTombstoneRecord | null> {
    return this.db().deletionTombstone.findUnique({ where: { conversationId } });
  }

  tombstone(id: string): Promise<DeletionTombstoneRecord | null> {
    return this.db().deletionTombstone.findUnique({ where: { id } });
  }

  pendingTombstones(limit: number): Promise<DeletionTombstoneRecord[]> {
    return this.db().deletionTombstone.findMany({
      where: { state: { in: ['pending', 'stopping', 'deleting'] } },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      take: Math.min(Math.max(Math.floor(limit), 1), 100),
    });
  }

  unfinishedTombstones(limit: number): Promise<DeletionTombstoneRecord[]> {
    return this.db().deletionTombstone.findMany({
      where: { state: { not: 'completed' } },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      take: Math.min(Math.max(Math.floor(limit), 1), 100),
    });
  }

  /**
   * 已完成墓碑中仍有资源残留的（G02）：用关系过滤一次取回，避免全表扫描后逐条查。
   * 资源表按 conversationId 关联（该列本身不设外键，删除登记可独立保留）。
   */
  async lateWriteResources(
    limit: number,
  ): Promise<Array<{ tombstoneId: string; conversationId: string; resource: LogResourceRecord }>> {
    const bounded = Math.min(Math.max(Math.floor(limit), 1), 100);
    const completed = await this.db().deletionTombstone.findMany({
      where: { state: 'completed', completedAt: { not: null } },
      orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
      take: bounded,
    });
    const out: Array<{ tombstoneId: string; conversationId: string; resource: LogResourceRecord }> = [];
    for (const tombstone of completed) {
      // 只取"删除完成之后"登记的记录：删除前存在的历史资源不在此列
      const late = await this.db().conversationLogResource.findMany({
        where: { conversationId: tombstone.conversationId, registeredAt: { gt: tombstone.completedAt! } },
        orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }],
      });
      for (const resource of late) {
        out.push({ tombstoneId: tombstone.id, conversationId: tombstone.conversationId, resource });
      }
    }
    return out;
  }

  updateTombstone(input: Parameters<LogResourceRepositoryPort['updateTombstone']>[0]): Promise<DeletionTombstoneRecord> {
    return this.db().deletionTombstone.update({
      where: { id: input.id },
      data: {
        state: input.state,
        ...(input.lastErrorCode === undefined ? {} : { lastErrorCode: input.lastErrorCode }),
        ...(input.incrementAttempts ? { attempts: { increment: 1 } } : {}),
        ...(input.completedAt === undefined ? {} : { completedAt: input.completedAt }),
      },
    });
  }

  async deleteResourceRecord(id: string): Promise<void> {
    await this.db().conversationLogResource.deleteMany({ where: { id } });
  }
}
