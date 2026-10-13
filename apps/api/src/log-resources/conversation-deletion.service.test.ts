import { describe, expect, it, vi } from 'vitest';
import type { AgentExecutionRepositoryPort } from '../ports/agent-execution.repository';
import type { OperationsJournalPort } from '../ports/operations-journal.port';
import type { LogResourceRepositoryPort, LogResourceRecord, DeletionTombstoneRecord } from '../ports/log-resource.repository';
import type { ConversationDeletionRepositoryPort } from '../ports/conversation-deletion.repository';
import type { LogResourceCleanerPort } from '../ports/log-resource-cleaner.port';
import type { AssistantEventSpoolPort, AssistantEventSpoolResource } from '../ports/assistant-event-spool.port';
import { LogResourceService } from './log-resource.service';
import { ConversationDeletionService } from './conversation-deletion.service';
import type { AgentExecutionService } from '../execution/agent-execution.service';
import type { DeletionManifestPort } from '../ports/deletion-manifest.port';

const now = new Date('2026-09-25T00:00:00.000Z');
const conversation = { id: 'conversation-1', anonId: 'anon-hash', placementKey: 'post-detail', scopeSlug: 'post-a', runIds: ['run-public'] };
const initialResources: LogResourceRecord[] = [
  { id: 'message-resource', conversationId: conversation.id, resourceType: 'message', resourceKey: 'message-1', agentRevisionId: null, parentKey: 'turn-1', resourceCreatedAt: now, registeredAt: now },
  { id: 'run-resource', conversationId: conversation.id, resourceType: 'execution-run', resourceKey: 'run-public', agentRevisionId: null, parentKey: null, resourceCreatedAt: now, registeredAt: now },
  { id: 'trace-resource', conversationId: conversation.id, resourceType: 'trace', resourceKey: 'run-public', agentRevisionId: null, parentKey: null, resourceCreatedAt: now, registeredAt: now },
];

function createService(options: { failFirstCleanup?: boolean; auditFailure?: boolean; initialState?: string; stopUnconfirmed?: boolean; manifestFailure?: boolean } = {}) {
  const order: string[] = [];
  let tombstone: DeletionTombstoneRecord | null = options.initialState ? {
    id: 'existing-tombstone', conversationId: conversation.id, state: options.initialState, attempts: 1,
    lastErrorCode: null, requestedAt: now, updatedAt: now, completedAt: null,
  } : null;
  let resources = [...initialResources];
  let failCleanup = options.failFirstCleanup ?? false;
  let runExists = true;
  const queuedResources: AssistantEventSpoolResource[] = [];
  const resourceRepository: LogResourceRepositoryPort = {
    register: vi.fn(async () => {}),
    find: vi.fn(async () => null),
    forConversation: vi.fn(async () => resources),
    expired: vi.fn(async () => []),
    getPolicy: vi.fn(async () => ({ detailRetentionDays: 90, aggregateRetentionDays: 365, updatedAt: now })),
    updatePolicy: vi.fn(async () => ({ detailRetentionDays: 90, aggregateRetentionDays: 365, updatedAt: now })),
    hasDeletionTombstone: vi.fn(async () => tombstone !== null),
    tombstoneForConversation: vi.fn(async () => tombstone),
    tombstone: vi.fn(async () => tombstone),
    pendingTombstones: vi.fn(async () => tombstone && tombstone.state !== 'completed' && tombstone.state !== 'blocked' ? [tombstone] : []),
    unfinishedTombstones: vi.fn(async () => tombstone && tombstone.state !== 'completed' ? [tombstone] : []),
    lateWriteResources: vi.fn(async () => []),
    updateTombstone: vi.fn(async (input) => {
      tombstone = { ...tombstone!, state: input.state, attempts: tombstone!.attempts + (input.incrementAttempts ? 1 : 0), lastErrorCode: input.lastErrorCode ?? null, completedAt: input.completedAt ?? tombstone!.completedAt, updatedAt: now };
      return tombstone;
    }),
    deleteResourceRecord: vi.fn(async (id) => { resources = resources.filter((resource) => resource.id !== id); }),
  };
  const spool = { listResources: vi.fn(async () => queuedResources), remove: vi.fn(async () => {}) } as unknown as AssistantEventSpoolPort;
  const logs = new LogResourceService(resourceRepository, spool);
  const deletionRepository: ConversationDeletionRepositoryPort = {
    conversation: vi.fn(async () => conversation),
    deleteDatabaseResource: vi.fn(async (resource) => {
      order.push(`db:${resource.resourceType}`);
      if (resource.resourceType === 'execution-run') runExists = false;
      if (resource.resourceType === 'execution-run') resources = resources.filter((candidate) => candidate.resourceType !== 'execution-event' || candidate.parentKey !== resource.resourceKey);
    }),
    finalizeConversation: vi.fn(async () => { order.push('finalize'); tombstone = { ...tombstone!, state: 'completed', completedAt: now, updatedAt: now }; }),
  };
  const fileCleaner: LogResourceCleanerPort = {
    remove: vi.fn(async (resource) => {
      order.push(`file:${resource.resourceType}`);
      if (failCleanup) { failCleanup = false; throw new Error('/private/path cleanup failed'); }
    }),
  };
  const journal = {
    transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
      let pending = tombstone;
      const result = await work({
        ensureDeletionTombstone: vi.fn(async (id: string, conversationId: string) => {
          order.push('tombstone');
          if (!pending) pending = { id, conversationId, state: 'pending', attempts: 0, lastErrorCode: null, requestedAt: now, updatedAt: now, completedAt: null };
          return { tombstone: pending, created: pending.id === id };
        }),
        appendAudit: vi.fn(async () => {
          order.push('audit');
          if (options.auditFailure) throw new Error('audit unavailable');
        }),
      });
      tombstone = pending;
      return result;
    }),
  };
  const executionRuns = { findById: vi.fn(async () => runExists ? ({ id: 'run-public', origin: 'public', state: 'RUNNING' }) : null) };
  const execution = { stopPublicRun: vi.fn(async () => {
    order.push('stop');
    return options.stopUnconfirmed
      ? { outcome: 'isolated', runId: 'run-public', reason: 'close-unconfirmed' }
      : { outcome: 'stopped', runId: 'run-public', state: 'CANCELLED' };
  }) };
  const manifest: DeletionManifestPort = {
    health: vi.fn(async () => {}),
    record: vi.fn(async () => {
      order.push('manifest');
      if (options.manifestFailure) throw new Error('manifest unavailable');
    }),
    recordMany: vi.fn(async () => {}),
    entries: vi.fn(async () => []),
  };
  const service = new ConversationDeletionService(
    journal as unknown as OperationsJournalPort,
    resourceRepository,
    deletionRepository,
    logs,
    fileCleaner,
    executionRuns as unknown as AgentExecutionRepositoryPort,
    execution as unknown as AgentExecutionService,
    manifest,
  );
  return { service, order, resourceRepository, deletionRepository, fileCleaner, executionRuns, execution, journal, manifest, getTombstone: () => tombstone };
}

describe('ConversationDeletionService', () => {
  it('writes the audit+tombstone before stopping and removes every registered resource', async () => {
    const h = createService();
    const task = await h.service.requestDelete(conversation.id, 'owner');

    expect(h.order[0]).toBe('tombstone');
    expect(h.order[1]).toBe('audit');
    expect(h.order.indexOf('manifest')).toBeLessThan(h.order.indexOf('stop'));
    expect(h.order.indexOf('stop')).toBeLessThan(h.order.indexOf('file:trace'));
    expect(task.state).toBe('completed');
    expect(h.deletionRepository.deleteDatabaseResource).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'message' }));
    expect(h.deletionRepository.finalizeConversation).toHaveBeenCalled();
  });

  it('keeps a tombstone and resumes a failed cleanup on a later DELETE retry', async () => {
    const h = createService({ failFirstCleanup: true });
    const blocked = await h.service.requestDelete(conversation.id, 'owner');
    expect(blocked.state).toBe('blocked');
    expect(h.getTombstone()?.lastErrorCode).toBe('resource-cleanup-failed');

    const retried = await h.service.requestDelete(conversation.id, 'owner');
    expect(retried.state).toBe('completed');
    expect(h.journal.transaction).toHaveBeenCalledTimes(1);
  });

  it('resumes an interrupted deleting tombstone after a service restart', async () => {
    const h = createService({ initialState: 'deleting' });
    await h.service.resumePending();
    expect(h.getTombstone()?.state).toBe('completed');
    expect(h.deletionRepository.finalizeConversation).toHaveBeenCalledWith(conversation.id, 'existing-tombstone');
  });

  it('preserves all body resources when runtime stop is not confirmed', async () => {
    const h = createService({ stopUnconfirmed: true });
    const task = await h.service.requestDelete(conversation.id, 'owner');
    expect(task).toMatchObject({ state: 'blocked', lastErrorCode: 'runtime-stop-unconfirmed' });
    expect(h.deletionRepository.deleteDatabaseResource).not.toHaveBeenCalled();
    expect(h.fileCleaner.remove).not.toHaveBeenCalled();
    expect(h.deletionRepository.finalizeConversation).not.toHaveBeenCalled();
  });

  it('refuses to start deletion when the durable audit cannot be committed', async () => {
    const h = createService({ auditFailure: true });
    await expect(h.service.requestDelete(conversation.id, 'owner')).rejects.toThrow(/audit unavailable/);
    expect(h.execution.stopPublicRun).not.toHaveBeenCalled();
    expect(h.deletionRepository.deleteDatabaseResource).not.toHaveBeenCalled();
  });

  it('does not stop or erase data when the recovery manifest cannot be committed', async () => {
    const h = createService({ manifestFailure: true });

    const task = await h.service.requestDelete(conversation.id, 'owner');

    expect(task).toMatchObject({ state: 'blocked', lastErrorCode: 'deletion-manifest-write-failed' });
    expect(h.execution.stopPublicRun).not.toHaveBeenCalled();
    expect(h.deletionRepository.deleteDatabaseResource).not.toHaveBeenCalled();
    expect(h.fileCleaner.remove).not.toHaveBeenCalled();
  });
});
