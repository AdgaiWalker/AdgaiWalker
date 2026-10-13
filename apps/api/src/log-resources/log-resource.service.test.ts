import { describe, expect, it, vi } from 'vitest';
import { LogResourceService } from './log-resource.service';
import type { AssistantEventSpoolPort } from '../ports/assistant-event-spool.port';
import type { LogResourceRepositoryPort } from '../ports/log-resource.repository';

const now = new Date('2026-09-25T00:00:00.000Z');
const resources = [
  { id: 'detail-1', conversationId: 'conversation-1', resourceType: 'message', resourceKey: 'message-1', agentRevisionId: null, parentKey: null, resourceCreatedAt: new Date('2026-07-27T00:00:00.000Z'), registeredAt: now },
  { id: 'aggregate-1', conversationId: null, resourceType: 'daily-aggregate', resourceKey: '2026-01-27', agentRevisionId: null, parentKey: null, resourceCreatedAt: new Date('2026-01-27T00:00:00.000Z'), registeredAt: now },
];

function createService() {
  const policy = { id: 'default', detailRetentionDays: 90, aggregateRetentionDays: 365, updatedAt: now };
  const repository: LogResourceRepositoryPort = {
    register: vi.fn(async () => {}),
    find: vi.fn(async () => null),
    forConversation: vi.fn(async () => resources),
    expired: vi.fn(async () => resources),
    getPolicy: vi.fn(async () => policy),
    updatePolicy: vi.fn(async (input) => Object.assign(policy, input)),
    hasDeletionTombstone: vi.fn(async () => false),
    tombstoneForConversation: vi.fn(async () => null),
    tombstone: vi.fn(async () => null),
    pendingTombstones: vi.fn(async () => []),
    unfinishedTombstones: vi.fn(async () => []),
  lateWriteResources: vi.fn(async () => []),
    updateTombstone: vi.fn(async () => { throw new Error('not-used'); }),
    deleteResourceRecord: vi.fn(async () => {}),
  };
  const spool = {
    listResources: vi.fn(async () => []),
  } as unknown as AssistantEventSpoolPort;
  return { service: new LogResourceService(repository, spool), repository, spool, policy };
}

describe('LogResourceService', () => {
  it('derives expiry from the current detail policy and keeps aggregate retention separate', async () => {
    const { service } = createService();

    const before = await service.expiredResources(now);
    expect(before.map((resource) => resource.resourceKey)).toEqual([]);

    await service.updatePolicy({ detailRetentionDays: 30, aggregateRetentionDays: 180 });
    const after = await service.expiredResources(now);
    expect(after.map((resource) => resource.resourceKey)).toEqual(['2026-01-27', 'message-1']);
    expect(after.map((resource) => resource.expiresAt)).toEqual([
      '2026-07-26T00:00:00.000Z',
      '2026-08-26T00:00:00.000Z',
    ]);
  });

  it('returns all registered resource descriptors for a conversation without a path field', async () => {
    const { service, repository } = createService();
    vi.mocked(repository.forConversation).mockResolvedValue([resources[0]]);

    await expect(service.resourcesForConversation('conversation-1')).resolves.toMatchObject([
      { resourceType: 'message', resourceKey: 'message-1', conversationId: 'conversation-1' },
    ]);
  });

  it('enumerates queued spool metadata for the owning conversation', async () => {
    const { service, spool } = createService();
    vi.mocked(spool.listResources).mockResolvedValue([{
      eventId: 'spool-event-1', conversationId: 'conversation-1', queuedAt: '2026-09-24T00:00:00.000Z',
    }]);

    await expect(service.resourcesForConversation('conversation-1', now)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'assistant-event-spool', resourceKey: 'spool-event-1' }),
    ]));
  });

  it('rejects retention periods that exceed the default or are not positive integers', async () => {
    const { service } = createService();
    await expect(service.updatePolicy({ detailRetentionDays: 91, aggregateRetentionDays: 365 })).rejects.toThrow(/log-retention-invalid/);
    await expect(service.updatePolicy({ detailRetentionDays: 0, aggregateRetentionDays: 365 })).rejects.toThrow(/log-retention-invalid/);
  });
});
