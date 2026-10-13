import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaPort } from '../ports/prisma.port';
import type { DeletionManifestPort } from '../ports/deletion-manifest.port';
import { DeletionManifestReplayService } from './deletion-manifest-replay.service';

const db = new PrismaClient();
const id = `v19-manifest-${randomUUID().replaceAll('-', '')}`;
const conversationId = `${id}-conversation`;
const turnId = `${id}-turn`;
const messageId = `${id}-message`;
const tombstoneId = `${id}-tombstone`;
const requestedAt = '2026-09-25T00:00:00.000Z';

afterEach(async () => {
  await db.conversationLogResource.deleteMany({ where: { conversationId } });
  await db.deletionTombstone.deleteMany({ where: { conversationId } });
  await db.auditRecord.deleteMany({ where: { targetId: conversationId } });
  await db.conversation.deleteMany({ where: { id: conversationId } });
});

afterAll(async () => { await db.$disconnect(); });

describe('DeletionManifestReplayService', () => {
  it('imports a missing deletion fact as a pending tombstone without deleting audit-safe body data early', async () => {
    await db.conversation.create({ data: { id: conversationId, anonId: `${id}-anon`, placementKey: 'post-detail', scopeSlug: 'post-a' } });
    await db.conversationTurn.create({ data: { id: turnId, conversationId, seq: 1, requestKey: `${id}-request` } });
    await db.conversationMessage.create({ data: { id: messageId, turnId, role: 'visitor', body: 'restore must remove this body', delivery: 'ack' } });
    await db.conversationLogResource.create({ data: { id: `${id}-resource`, conversationId, resourceType: 'message', resourceKey: messageId } });
    const manifest: DeletionManifestPort = {
      health: vi.fn(async () => {}),
      entries: vi.fn(async () => [{ tombstoneId, conversationId, requestedAt }]),
      record: vi.fn(async () => {}),
      recordMany: vi.fn(async () => {}),
    };

    const service = new DeletionManifestReplayService({ getClient: () => db } as PrismaPort, manifest);
    await service.replay({ force: true });

    await expect(db.deletionTombstone.findUnique({ where: { conversationId } })).resolves.toMatchObject({
      id: tombstoneId, state: 'pending',
    });
    await expect(db.conversationMessage.findUnique({ where: { id: messageId } })).resolves.toMatchObject({ body: 'restore must remove this body' });
    const audit = await db.auditRecord.findFirst({ where: { action: 'conversation-delete-replayed', targetId: conversationId } });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit)).not.toContain('restore must remove this body');
    expect(manifest.recordMany).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ tombstoneId, conversationId, requestedAt }),
    ]));
  });

  it('reopens a completed tombstone when the restore target still contains its conversation', async () => {
    await db.conversation.create({ data: { id: conversationId, anonId: `${id}-anon`, placementKey: 'post-detail', scopeSlug: 'post-a' } });
    await db.deletionTombstone.create({ data: { id: tombstoneId, conversationId, state: 'completed', completedAt: new Date(requestedAt) } });
    const manifest: DeletionManifestPort = {
      health: vi.fn(async () => {}),
      entries: vi.fn(async () => [{ tombstoneId, conversationId, requestedAt }]),
      record: vi.fn(async () => {}),
      recordMany: vi.fn(async () => {}),
    };

    await new DeletionManifestReplayService({ getClient: () => db } as PrismaPort, manifest).replay({ force: true });

    await expect(db.deletionTombstone.findUnique({ where: { conversationId } })).resolves.toMatchObject({
      state: 'pending', completedAt: null,
    });
  });
});
