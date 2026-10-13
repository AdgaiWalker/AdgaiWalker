import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaConversationDeletionRepository } from '../adapters/prisma-conversation-deletion.repository';
import type { PrismaPort } from '../ports/prisma.port';

const runId = `v19-expired-admin-${randomUUID().replaceAll('-', '')}`;
const runResourceId = `${runId}-run-resource`;
const eventResourceId = `${runId}-event-resource`;
let db: PrismaClient;
let repository: PrismaConversationDeletionRepository;

beforeAll(async () => {
  db = new PrismaClient();
  repository = new PrismaConversationDeletionRepository({ getClient: () => db } as PrismaPort);
  await db.executionRun.create({
    data: {
      id: runId, kind: 'try', origin: 'admin', actor: 'owner', actorScope: 'admin:owner',
      requestKey: `${runId}-key`, inputHash: 'a'.repeat(64), state: 'SUCCEEDED',
    },
  });
  await db.executionEvent.create({
    data: { id: `${runId}-event`, runId, seq: 1, kind: 'text', text: 'expired private output' },
  });
  await db.conversationLogResource.create({
    data: { id: runResourceId, conversationId: null, resourceType: 'execution-run', resourceKey: runId },
  });
  await db.conversationLogResource.create({
    data: { id: eventResourceId, conversationId: null, resourceType: 'execution-event', resourceKey: `${runId}-event`, parentKey: runId },
  });
}, 30_000);

afterAll(async () => {
  await db?.conversationLogResource.deleteMany({ where: { resourceKey: { in: [runId, `${runId}-event`] } } });
  await db?.executionEvent.deleteMany({ where: { runId } });
  await db?.executionRun.deleteMany({ where: { id: runId } });
  await db?.$disconnect();
});

describe('PrismaConversationDeletionRepository global expiry cleanup', () => {
  it('removes a registered expired ownerless admin run and its event rows', async () => {
    await repository.deleteDatabaseResource({
      id: runResourceId, conversationId: null, resourceType: 'execution-run', resourceKey: runId,
      agentRevisionId: null, parentKey: null, resourceCreatedAt: new Date(0), registeredAt: new Date(0),
    });

    expect(await db.executionRun.findUnique({ where: { id: runId } })).toBeNull();
    expect(await db.executionEvent.findMany({ where: { runId } })).toEqual([]);
    expect(await db.conversationLogResource.count({ where: { OR: [{ id: runResourceId }, { id: eventResourceId }] } })).toBe(0);
  });
});
