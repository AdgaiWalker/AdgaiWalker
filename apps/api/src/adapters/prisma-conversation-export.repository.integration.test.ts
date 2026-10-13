import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaConversationExportRepository } from './prisma-conversation-export.repository';
import type { PrismaPort } from '../ports/prisma.port';

const prefix = `v21-export-repo-${randomUUID().replaceAll('-', '')}`;
const included = `${prefix}-included`;
const deleted = `${prefix}-deleted`;
const snapshotAt = new Date('2026-09-25T00:00:00.000Z');
const emptyFilters = { from: null, to: null, contentSlug: null, placementKey: null, agentId: null, runState: null, keyword: null };
let db: PrismaClient;
let repository: PrismaConversationExportRepository;

beforeAll(async () => {
  db = new PrismaClient();
  repository = new PrismaConversationExportRepository({ getClient: () => db } as PrismaPort);
  await db.conversation.createMany({ data: [
    { id: included, anonId: `${prefix}-owner`, placementKey: 'post-detail', scopeSlug: 'post-a' },
    { id: deleted, anonId: `${prefix}-deleted-owner`, placementKey: 'post-detail', scopeSlug: 'post-a' },
  ] });
  await db.deletionTombstone.create({ data: { conversationId: deleted, state: 'pending' } });
}, 30_000);

afterAll(async () => {
  await db?.conversationLogResource.deleteMany({ where: { parentKey: `${prefix}-job` } });
  await db?.auditRecord.deleteMany({ where: { targetId: `${prefix}-job` } });
  await db?.conversationExportJob.deleteMany({ where: { id: `${prefix}-job` } });
  await db?.deletionTombstone.deleteMany({ where: { conversationId: deleted } });
  await db?.conversation.deleteMany({ where: { id: { in: [included, deleted] } } });
  await db?.$disconnect();
});

describe('PrismaConversationExportRepository', () => {
  it('atomically freezes eligible conversation IDs, registers deletion resources, and audits creation', async () => {
    const job = await repository.create({
      id: `${prefix}-job`, format: 'json', filters: emptyFilters, snapshotAt,
      retentionCutoff: new Date('2026-06-27T00:00:00.000Z'),
      conversationIds: [included, deleted],
    });

    expect(job).toMatchObject({ id: `${prefix}-job`, status: 'QUEUED', rowCount: 1 });
    expect(await repository.snapshotConversationIds(job.id)).toEqual([included]);
    expect(await db.conversationLogResource.findMany({ where: { parentKey: job.id } })).toHaveLength(1);
    expect(await db.auditRecord.findFirst({ where: { targetType: 'conversation-export', targetId: job.id, action: 'conversation-export-requested' } })).toMatchObject({ outcome: 'queued' });
  });

  it('revokes an export when an included conversation is deleted and removes its snapshot registrations', async () => {
    await repository.revoke(`${prefix}-job`, 'conversation-deleted');

    expect((await repository.find(`${prefix}-job`))?.status).toBe('REVOKED');
    expect(await repository.snapshotConversationIds(`${prefix}-job`)).toEqual([]);
    expect(await db.conversationLogResource.count({ where: { parentKey: `${prefix}-job` } })).toBe(0);
  });
});
