import { describe, expect, it, vi } from 'vitest';
import type { ConversationDeletionService } from './conversation-deletion.service';
import type { LogResourceService, LogResourceView } from './log-resource.service';
import type { LogResourceRepositoryPort } from '../ports/log-resource.repository';
import type { LogResourceCleanerPort } from '../ports/log-resource-cleaner.port';
import type { ConversationDeletionRepositoryPort } from '../ports/conversation-deletion.repository';
import { LogRetentionCleanupService } from './log-retention-cleanup.service';

const now = new Date('2026-09-25T00:00:00.000Z');
const expired: LogResourceView[] = [
  {
    id: 'conversation-message-resource', conversationId: 'conversation-expired', resourceType: 'message', resourceKey: 'message-1',
    agentRevisionId: null, parentKey: 'turn-1', resourceCreatedAt: now, registeredAt: now,
    expiresAt: '2026-09-24T00:00:00.000Z', expired: true,
  },
  {
    id: 'global-trace-resource', conversationId: null, resourceType: 'trace', resourceKey: 'run_old',
    agentRevisionId: null, parentKey: null, resourceCreatedAt: now, registeredAt: now,
    expiresAt: '2026-09-24T00:00:00.000Z', expired: true,
  },
];

describe('LogRetentionCleanupService', () => {
  it('deletes expired conversations as a unit and removes expired ownerless resources', async () => {
    const calls: string[] = [];
    const logs = { expiredResources: vi.fn().mockResolvedValueOnce(expired).mockResolvedValueOnce([]) } as unknown as LogResourceService;
    const deletions = {
      requestDelete: vi.fn(async () => ({ state: 'completed' })),
    } as unknown as ConversationDeletionService;
    const cleaner = { remove: vi.fn(async (resource) => { calls.push(`file:${resource.resourceKey}`); }) } as LogResourceCleanerPort;
    const repository = {
      deleteResourceRecord: vi.fn(async (id) => { calls.push(`index:${id}`); }),
    } as unknown as LogResourceRepositoryPort;
    const deletionRepository = {
      deleteDatabaseResource: vi.fn(async (resource) => { calls.push(`db:${resource.resourceKey}`); }),
    } as unknown as ConversationDeletionRepositoryPort;
    const service = new LogRetentionCleanupService(logs, deletions, cleaner, repository, deletionRepository);

    await expect(service.cleanupExpired(now)).resolves.toMatchObject({ conversations: 1, resources: 1 });

    expect(deletions.requestDelete).toHaveBeenCalledWith('conversation-expired', 'retention-policy');
    expect(calls).toEqual(['file:run_old', 'db:run_old', 'index:global-trace-resource']);
  });

  it('keeps startup reconciliation failed when an expired conversation deletion is blocked', async () => {
    const logs = { expiredResources: vi.fn(async () => [expired[0]!]) } as unknown as LogResourceService;
    const deletions = {
      requestDelete: vi.fn(async () => ({ state: 'blocked' })),
    } as unknown as ConversationDeletionService;
    const service = new LogRetentionCleanupService(
      logs,
      deletions,
      { remove: vi.fn(async () => {}) },
      { deleteResourceRecord: vi.fn(async () => {}) } as unknown as LogResourceRepositoryPort,
      { deleteDatabaseResource: vi.fn(async () => {}) } as unknown as ConversationDeletionRepositoryPort,
    );

    await expect(service.cleanupExpired(now)).rejects.toThrow('retention-cleanup-incomplete');
  });
});
