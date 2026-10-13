import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DELETION_MANIFEST, type DeletionManifestEntry, type DeletionManifestPort } from '../ports/deletion-manifest.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

export type DeletionManifestReplayResult = { entries: number; reopened: number; pending: number };

@Injectable()
export class DeletionManifestReplayService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(DELETION_MANIFEST) private readonly manifest: DeletionManifestPort,
  ) {}

  async replay(options: { force?: boolean } = {}): Promise<DeletionManifestReplayResult> {
    const entries = await this.manifest.entries();
    const db = this.prisma.getClient();
    if (!db) throw new Error('deletion-manifest-database-unavailable');
    let reopened = 0;

    await db.$transaction(async (tx) => {
      for (const entry of entries) {
        const existing = await tx.deletionTombstone.findUnique({ where: { conversationId: entry.conversationId } });
        const conversationExists = Boolean(await tx.conversation.findUnique({
          where: { id: entry.conversationId }, select: { id: true },
        }));
        const resourceCount = await tx.conversationLogResource.count({ where: { conversationId: entry.conversationId } });
        const mustReopen = options.force || !existing || existing.state !== 'completed' || conversationExists || resourceCount > 0;

        if (!existing) {
          await tx.deletionTombstone.create({
            data: {
              id: entry.tombstoneId,
              conversationId: entry.conversationId,
              state: 'pending',
              requestedAt: new Date(entry.requestedAt),
            },
          });
          reopened += 1;
        } else if (mustReopen && existing.state !== 'pending') {
          await tx.deletionTombstone.update({
            where: { id: existing.id },
            data: { state: 'pending', lastErrorCode: null, completedAt: null },
          });
          reopened += 1;
        }

        if (!existing || (options.force && existing.state === 'completed' && (conversationExists || resourceCount > 0))) {
          const auditId = replayAuditId(entry.tombstoneId);
          if (!await tx.auditRecord.findUnique({ where: { id: auditId }, select: { id: true } })) {
            await tx.auditRecord.create({
              data: {
                id: auditId,
              actor: 'restore',
              action: 'conversation-delete-replayed',
              targetType: 'conversation',
              targetId: entry.conversationId,
              outcome: 'pending',
              },
            });
          }
        }
      }
    });

    const tombstones = await db.deletionTombstone.findMany({
      select: { id: true, conversationId: true, requestedAt: true, state: true },
    });
    await this.manifest.recordMany(tombstones.map((item) => ({
      tombstoneId: item.id,
      conversationId: item.conversationId,
      requestedAt: item.requestedAt.toISOString(),
    })));
    return {
      entries: entries.length,
      reopened,
      pending: tombstones.filter((item) => item.state !== 'completed').length,
    };
  }

  async assertManifestCompleted(): Promise<void> {
    const db = this.prisma.getClient();
    if (!db) throw new Error('deletion-manifest-database-unavailable');
    const entries = await this.manifest.entries();
    for (const entry of entries) {
      const tombstone = await db.deletionTombstone.findUnique({
        where: { conversationId: entry.conversationId }, select: { state: true },
      });
      if (!tombstone || tombstone.state !== 'completed') {
        throw new Error('deletion-manifest-replay-incomplete');
      }
    }
  }

  async assertRecoveryReady(): Promise<void> {
    await this.manifest.health();
    await this.assertManifestCompleted();
  }
}

function replayAuditId(tombstoneId: string): string {
  const hash = createHash('sha256').update(tombstoneId).digest('hex').slice(0, 32);
  return `restore-${hash}`;
}

export function toDeletionManifestEntry(value: {
  id: string;
  conversationId: string;
  requestedAt: Date;
}): DeletionManifestEntry {
  return {
    tombstoneId: value.id,
    conversationId: value.conversationId,
    requestedAt: value.requestedAt.toISOString(),
  };
}
