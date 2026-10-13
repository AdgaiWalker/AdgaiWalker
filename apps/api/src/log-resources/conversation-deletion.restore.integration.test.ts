import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaPort } from '../ports/prisma.port';
import type { AgentExecutionRepositoryPort } from '../ports/agent-execution.repository';
import type { AgentExecutionService } from '../execution/agent-execution.service';
import { FsAssistantEventSpool } from '../adapters/fs-assistant-event-spool';
import { FsDeletionManifestStore } from '../adapters/fs-deletion-manifest.store';
import { FsLogResourceCleaner } from '../adapters/fs-log-resource.cleaner';
import { FsTraceRepository } from '../adapters/fs-trace.repository';
import { PrismaConversationDeletionRepository } from '../adapters/prisma-conversation-deletion.repository';
import { PrismaLogResourceRepository } from '../adapters/prisma-log-resource.repository';
import { PrismaOperationsJournal } from '../adapters/prisma-operations-journal';
import { ConversationDeletionService } from './conversation-deletion.service';
import { DeletionManifestReplayService } from './deletion-manifest-replay.service';
import { LogResourceService } from './log-resource.service';

const id = `v19-restore-${randomUUID().replaceAll('-', '')}`;
const conversationId = `${id}-conversation`;
const turnId = `${id}-turn`;
const messageId = `${id}-message`;
const tombstoneId = `${id}-tombstone`;
const ownerId = `${id}-owner`;
const requestedAt = '2026-09-25T00:00:00.000Z';
const sourceDb = new PrismaClient();
let root = '';
let targetDb: PrismaClient;
let backupDbPath = '';
let targetDbPath = '';
let manifestPath = '';

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-v19-restore-'));
  backupDbPath = path.join(root, 'old-backup.db');
  targetDbPath = path.join(root, 'restored.db');
  manifestPath = path.join(root, 'control', 'deletion-manifest.json');
  await sourceDb.conversation.create({
    data: { id: conversationId, anonId: ownerId, placementKey: 'post-detail', scopeSlug: 'restore-test' },
  });
  await sourceDb.conversationTurn.create({
    data: { id: turnId, conversationId, seq: 1, requestKey: `${id}-request` },
  });
  await sourceDb.conversationMessage.create({
    data: { id: messageId, turnId, role: 'visitor', body: 'deleted body from old backup', delivery: 'ack' },
  });
  await sourceDb.conversationLogResource.create({
    data: { id: `${id}-resource`, conversationId, resourceType: 'message', resourceKey: messageId },
  });
  await sourceDb.$executeRawUnsafe(`VACUUM INTO '${backupDbPath.replaceAll("'", "''")}'`);
  await new FsDeletionManifestStore(manifestPath).record({ tombstoneId, conversationId, requestedAt });
  await sourceDb.conversationLogResource.deleteMany({ where: { conversationId } });
  await sourceDb.conversation.delete({ where: { id: conversationId } });
  await fs.copyFile(backupDbPath, targetDbPath);
  targetDb = new PrismaClient({ datasources: { db: { url: `file:${targetDbPath}` } } });
}, 30_000);

afterAll(async () => {
  await targetDb?.$disconnect();
  await sourceDb.conversationLogResource.deleteMany({ where: { conversationId } });
  await sourceDb.deletionTombstone.deleteMany({ where: { conversationId } });
  await sourceDb.auditRecord.deleteMany({ where: { targetId: conversationId } });
  await sourceDb.conversation.deleteMany({ where: { id: conversationId } });
  await sourceDb.$disconnect();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

describe('V19 restore reconciliation', () => {
  it('does not expose a message restored from a database snapshot older than its deletion manifest', async () => {
    expect(await sourceDb.conversationMessage.findUnique({ where: { id: messageId } })).toBeNull();
    expect(await targetDb.conversationMessage.findUnique({ where: { id: messageId } })).toMatchObject({ body: 'deleted body from old backup' });

    const prisma: PrismaPort = { getClient: () => targetDb, isWritable: () => true, ping: async () => true };
    const manifest = new FsDeletionManifestStore(manifestPath);
    const replay = new DeletionManifestReplayService(prisma, manifest);
    await replay.replay({ force: true });
    expect(await targetDb.deletionTombstone.findUnique({ where: { conversationId } })).toMatchObject({ state: 'pending' });

    const spool = new FsAssistantEventSpool(`file:${targetDbPath}`);
    const resourceRepository = new PrismaLogResourceRepository(prisma);
    const logs = new LogResourceService(resourceRepository, spool);
    const cleanup = new ConversationDeletionService(
      new PrismaOperationsJournal(prisma),
      resourceRepository,
      new PrismaConversationDeletionRepository(prisma),
      logs,
      new FsLogResourceCleaner(prisma, spool, new FsTraceRepository(), { revokeAndRemove: async () => {} }),
      { findById: async () => null } as unknown as AgentExecutionRepositoryPort,
      { stopPublicRun: async () => ({ outcome: 'stopped', runId: '', state: 'CANCELLED' }) } as unknown as AgentExecutionService,
      manifest,
    );
    const task = await cleanup.requestDelete(conversationId, 'restore');

    expect(task.state).toBe('completed');
    expect(await targetDb.conversationMessage.findUnique({ where: { id: messageId } })).toBeNull();
    expect(await targetDb.conversation.findUnique({ where: { id: conversationId } })).toBeNull();
    expect(await targetDb.deletionTombstone.findUnique({ where: { conversationId } })).toMatchObject({ state: 'completed' });
    const audit = await targetDb.auditRecord.findFirst({ where: { action: 'conversation-delete-replayed', targetId: conversationId } });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit)).not.toContain('deleted body from old backup');
    await replay.assertManifestCompleted();
  });
});
