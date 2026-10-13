import { describe, expect, it, vi } from 'vitest';
import type { ConversationRepositoryPort } from '../ports/conversation.repository';
import type { AssistantEventSpoolPort } from '../ports/assistant-event-spool.port';
import { AssistantEventRecorder } from './assistant-event-recorder.service';

const input = {
  id: 'recorder-event-1', eventId: 'v16-recorder-event-1', featureKey: 'assistant.interaction',
  event: 'open', actorType: 'visitor', conversationId: null, props: { scopeSlug: 'post-a' },
};
const noTombstone = { hasDeletionTombstone: vi.fn(async () => false) };

describe('AssistantEventRecorder', () => {
  it('queues a failed database write and replays it idempotently when storage recovers', async () => {
    const repository = { recordEvent: vi.fn().mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue('recorded') };
    const spool = {
      enqueue: vi.fn(async () => 'queued' as const),
      readBatch: vi.fn(async () => [{ event: input, queuedAt: '2026-09-25T00:00:00.000Z' }]),
      listResources: vi.fn(async () => []),
      remove: vi.fn(async () => {}),
      health: vi.fn(async () => ({ status: 'healthy' as const, queuedCount: 0, queuedBytes: 0, oldestQueuedAt: null, droppedCount: 0 })),
    };
    const recorder = new AssistantEventRecorder(repository as never, spool as unknown as AssistantEventSpoolPort, noTombstone as never);

    expect(await recorder.record(input)).toEqual({ recorded: false, duplicate: false, queued: true });
    expect(spool.enqueue).toHaveBeenCalledWith(input);
    expect(await recorder.replayOnce()).toEqual({ replayed: 1, pending: 0 });
    expect(repository.recordEvent).toHaveBeenNthCalledWith(2, input);
    expect(spool.remove).toHaveBeenCalledWith([input.eventId]);
  });

  it('reports dropped telemetry honestly without throwing into the caller', async () => {
    const repository = { recordEvent: vi.fn(async () => { throw new Error('database unavailable'); }) };
    const spool = {
      enqueue: vi.fn(async () => 'dropped' as const),
      readBatch: vi.fn(async () => []),
      listResources: vi.fn(async () => []),
      remove: vi.fn(async () => {}),
      health: vi.fn(async () => ({ status: 'loss-unknown' as const, queuedCount: 0, queuedBytes: 0, oldestQueuedAt: null, droppedCount: null })),
    };
    const recorder = new AssistantEventRecorder(repository as never, spool as unknown as AssistantEventSpoolPort, noTombstone as never);
    expect(await recorder.record(input)).toEqual({ recorded: false, duplicate: false, queued: false });
    await expect(recorder.health()).resolves.toMatchObject({ status: 'loss-unknown', droppedCount: null });
  });

  it('queues after a database write stalls instead of waiting forever', async () => {
    vi.useFakeTimers();
    try {
      const repository = { recordEvent: vi.fn(() => new Promise<'recorded' | 'duplicate'>(() => {})) };
      const spool = {
        enqueue: vi.fn(async () => 'queued' as const),
        readBatch: vi.fn(async () => []),
        listResources: vi.fn(async () => []),
        remove: vi.fn(async () => {}),
        health: vi.fn(async () => ({ status: 'backlog' as const, queuedCount: 1, queuedBytes: 100, oldestQueuedAt: '2026-09-25T00:00:00.000Z', droppedCount: 0 })),
      };
      const recorder = new AssistantEventRecorder(repository as never, spool as unknown as AssistantEventSpoolPort, noTombstone as never);
      const result = recorder.record(input);

      await vi.runAllTimersAsync();
      await expect(result).resolves.toEqual({ recorded: false, duplicate: false, queued: true });
      expect(spool.enqueue).toHaveBeenCalledWith(input);
    } finally {
      vi.useRealTimers();
    }
  });

  it('removes a replay duplicate after the database confirms the stable event ID already exists', async () => {
    const repository = { recordEvent: vi.fn(async () => 'duplicate' as const) };
    const spool = {
      enqueue: vi.fn(async () => 'queued' as const),
      readBatch: vi.fn(async () => [{ event: input, queuedAt: '2026-09-25T00:00:00.000Z' }]),
      listResources: vi.fn(async () => []),
      remove: vi.fn(async () => {}),
      health: vi.fn(async () => ({ status: 'healthy' as const, queuedCount: 0, queuedBytes: 0, oldestQueuedAt: null, droppedCount: 0 })),
    };
    const recorder = new AssistantEventRecorder(repository as never, spool as unknown as AssistantEventSpoolPort, noTombstone as never);

    expect(await recorder.replayOnce()).toEqual({ replayed: 1, pending: 0 });
    expect(spool.remove).toHaveBeenCalledWith([input.eventId]);
  });

  it('drops and removes queued event metadata for a tombstoned conversation', async () => {
    const repository = { recordEvent: vi.fn(async () => 'recorded' as const) };
    const spool = {
      enqueue: vi.fn(async () => 'queued' as const),
      readBatch: vi.fn(async () => [{ event: { ...input, conversationId: 'deleted-conversation' }, queuedAt: '2026-09-25T00:00:00.000Z' }]),
      listResources: vi.fn(async () => []),
      remove: vi.fn(async () => {}),
      health: vi.fn(async () => ({ status: 'healthy' as const, queuedCount: 0, queuedBytes: 0, oldestQueuedAt: null, droppedCount: 0 })),
    };
    const resources = { hasDeletionTombstone: vi.fn(async () => true) };
    const recorder = new AssistantEventRecorder(repository as never, spool as unknown as AssistantEventSpoolPort, resources as never);

    await expect(recorder.record({ ...input, conversationId: 'deleted-conversation' })).resolves.toMatchObject({
      recorded: false, duplicate: false, queued: false,
    });
    expect(await recorder.replayOnce()).toEqual({ replayed: 0, pending: 0 });
    expect(spool.enqueue).not.toHaveBeenCalled();
    expect(spool.remove).toHaveBeenCalledWith([input.eventId]);
    expect(repository.recordEvent).not.toHaveBeenCalled();
  });
});
