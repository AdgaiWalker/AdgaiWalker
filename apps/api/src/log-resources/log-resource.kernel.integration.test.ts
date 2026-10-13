import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaLogResourceRepository } from '../adapters/prisma-log-resource.repository';
import type { PrismaPort } from '../ports/prisma.port';
import type { AssistantEventSpoolPort } from '../ports/assistant-event-spool.port';
import { LogResourceService } from './log-resource.service';

const conversationId = `v17-conversation-${randomUUID()}`;
const now = new Date('2026-09-25T00:00:00.000Z');
let db: PrismaClient;
let service: LogResourceService;
let originalPolicy: { detailRetentionDays: number; aggregateRetentionDays: number };

beforeAll(async () => {
  db = new PrismaClient();
  const repository = new PrismaLogResourceRepository({ getClient: () => db } as PrismaPort);
  const spool = { listResources: async () => [] } as unknown as AssistantEventSpoolPort;
  service = new LogResourceService(repository, spool);
  const policy = await service.getPolicy();
  originalPolicy = { detailRetentionDays: policy.detailRetentionDays, aggregateRetentionDays: policy.aggregateRetentionDays };
});

afterAll(async () => {
  await db?.conversationLogResource.deleteMany({ where: { conversationId } });
  await db?.deletionTombstone.deleteMany({ where: { conversationId } });
  if (service && originalPolicy) await service.updatePolicy(originalPolicy);
  await db?.$disconnect();
});

describe('LogResourceService SQLite integration', () => {
  it('enumerates body-bearing records and selects expiries after retention is shortened', async () => {
    await service.register({
      conversationId, resourceType: 'message', resourceKey: `${conversationId}-message`,
      resourceCreatedAt: new Date('2026-07-27T00:00:00.000Z'),
    });
    await service.register({
      conversationId, resourceType: 'execution-run', resourceKey: `${conversationId}-run`,
      resourceCreatedAt: new Date('2026-01-27T00:00:00.000Z'),
    });
    await service.register({
      conversationId, resourceType: 'daily-aggregate', resourceKey: `${conversationId}-aggregate`,
      resourceCreatedAt: new Date('2026-01-27T00:00:00.000Z'),
    });
    await service.register({
      conversationId, resourceType: 'export', resourceKey: `${conversationId}/job`, parentKey: `${conversationId}-job`,
      resourceCreatedAt: new Date('2026-01-27T00:00:00.000Z'),
    });

    const types = (await service.resourcesForConversation(conversationId, now))
      .map((resource) => resource.resourceType)
      .sort();
    expect(types).toEqual(['daily-aggregate', 'execution-run', 'export', 'message']);
    await service.updatePolicy({ detailRetentionDays: 30, aggregateRetentionDays: 180 });
    const expired = await service.expiredResources(now);
    expect(expired.map((resource) => resource.resourceKey)).toEqual([
      `${conversationId}-run`, `${conversationId}-aggregate`, `${conversationId}-message`,
    ]);
    expect(expired.some((resource) => resource.resourceType === 'export')).toBe(false);
  });

  it('does not register a new resource after a deletion tombstone exists', async () => {
    await db.deletionTombstone.create({ data: { conversationId } });
    expect(await service.register({
      conversationId, resourceType: 'message', resourceKey: `${conversationId}-after-delete`,
    })).toBe(false);
    expect(await db.conversationLogResource.findUnique({
      where: { resourceType_resourceKey: { resourceType: 'message', resourceKey: `${conversationId}-after-delete` } },
    })).toBeNull();
  });
});
