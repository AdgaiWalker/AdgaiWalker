import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/http-error';
import { ConversationQueryService } from './conversation-query.service';
import type { LogResourceService } from './log-resource.service';

const page = { items: [], nextCursor: null, limit: 50 as const };
const defaultRetention = {
  getPolicy: vi.fn(async () => ({ detailRetentionDays: 90, aggregateRetentionDays: 365, updatedAt: new Date(0) })),
} as unknown as LogResourceService;

describe('ConversationQueryService', () => {
  it('normalizes server-side filters and supports 50/100 cursor pages', async () => {
    const repository = { health: vi.fn(async () => {}), list: vi.fn(async () => page), snapshotIds: vi.fn(async () => []), detail: vi.fn(async () => null) };
    const service = new ConversationQueryService(repository, defaultRetention);

    await expect(service.list({
      limit: '100', keyword: '  退款  ', contentSlug: 'post-a', placementKey: 'post-detail',
      agentId: 'agent-a', runState: 'FAILED', from: '2026-09-01', to: '2026-09-25',
    })).resolves.toEqual(page);

    expect(repository.list).toHaveBeenCalledWith(expect.objectContaining({
      limit: 100, keyword: '退款', contentSlug: 'post-a', placementKey: 'post-detail',
      agentId: 'agent-a', runState: 'FAILED',
      from: new Date('2026-09-01T00:00:00.000Z'),
      toExclusive: new Date('2026-09-26T00:00:00.000Z'),
    }));
  });

  it('hides records outside the current detail-retention window before querying', async () => {
    const repository = { health: vi.fn(async () => {}), list: vi.fn(async () => page), snapshotIds: vi.fn(async () => []), detail: vi.fn(async () => null) };
    const retention = {
      getPolicy: vi.fn(async () => ({ detailRetentionDays: 30, aggregateRetentionDays: 365, updatedAt: new Date(0) })),
    } as unknown as LogResourceService;
    const service = new ConversationQueryService(repository, retention);

    await service.list({}, new Date('2026-09-25T00:00:00.000Z'));

    expect(repository.list).toHaveBeenCalledWith(expect.objectContaining({
      retentionCutoff: new Date('2026-08-26T00:00:00.000Z'),
    }));
  });

  it('rejects invalid page sizes, state names, dates, and malformed cursors before querying', async () => {
    const repository = { health: vi.fn(async () => {}), list: vi.fn(async () => page), snapshotIds: vi.fn(async () => []), detail: vi.fn(async () => null) };
    const service = new ConversationQueryService(repository, defaultRetention);

    for (const query of [
      { limit: '25' }, { runState: 'FINISHED' }, { from: 'yesterday' },
      { from: '2026-09-25', to: '2026-09-01' }, { cursor: 'not-a-cursor' },
    ]) {
      const failure = service.list(query).catch((error: unknown) => error);
      await expect(failure, JSON.stringify(query)).resolves.toBeInstanceOf(ApiError);
      const error = await failure as ApiError;
      expect(error.getResponse()).toMatchObject({ code: 'conversation-query-invalid' });
    }
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('treats a tombstoned or missing conversation as unavailable to the admin reader', async () => {
    const repository = { health: vi.fn(async () => {}), list: vi.fn(async () => page), snapshotIds: vi.fn(async () => []), detail: vi.fn(async () => null) };
    const service = new ConversationQueryService(repository, defaultRetention);
    await expect(service.detail('deleted-conversation')).rejects.toMatchObject({
      response: { code: 'conversation-not-found' },
    });
  });

  it('applies the current detail-retention cutoff to detail reads', async () => {
    const now = new Date('2026-09-25T00:00:00.000Z');
    const repository = { health: vi.fn(async () => {}), list: vi.fn(async () => page), snapshotIds: vi.fn(async () => []), detail: vi.fn(async () => null) };
    const retention = {
      getPolicy: vi.fn(async () => ({ detailRetentionDays: 30, aggregateRetentionDays: 365, updatedAt: new Date(0) })),
    } as unknown as LogResourceService;
    const service = new ConversationQueryService(repository, retention);

    await expect(service.detail('expired-conversation', now)).rejects.toMatchObject({
      response: { code: 'conversation-not-found' },
    });
    expect(repository.detail).toHaveBeenCalledWith('expired-conversation', new Date('2026-08-26T00:00:00.000Z'));
  });
});
