import { describe, expect, it, vi } from 'vitest';
import { ConversationExportService } from './conversation-export.service';
import type { ConversationExportRepositoryPort } from '../ports/conversation-export.repository';
import type { ConversationExportFileStorePort } from '../ports/conversation-export-file-store.port';
import type { ConversationQueryRepositoryPort } from '../ports/conversation-query.repository';
import { ConversationQueryService } from './conversation-query.service';

describe('ConversationExportService', () => {
  it('rejects unknown filter keys instead of silently widening the export scope', async () => {
    const queryService = { snapshotFilter: vi.fn(async () => ({})) };
    const queryRepository = { snapshotIds: vi.fn(async () => []) } as unknown as ConversationQueryRepositoryPort;
    const exportRepository = { create: vi.fn(async () => { throw new Error('export-create-reached'); }) } as unknown as ConversationExportRepositoryPort;
    const service = new ConversationExportService(
      queryService as unknown as ConversationQueryService,
      queryRepository,
      exportRepository,
      {} as ConversationExportFileStorePort,
    );

    await expect(service.create({ format: 'csv', filters: { contentSlug: 'post-a', sessionId: 'expected-session' } })).rejects.toMatchObject({
      response: { code: 'conversation-export-invalid' }, status: 400,
    });
    expect(queryService.snapshotFilter).not.toHaveBeenCalled();
    expect(exportRepository.create).not.toHaveBeenCalled();
  });

  it('rejects snapshots over 10,000 rows instead of silently truncating them', async () => {
    const queryService = { snapshotFilter: vi.fn(async () => ({ retentionCutoff: new Date(0) })) };
    const queryRepository = {
      snapshotIds: vi.fn(async () => Array.from({ length: 10_001 }, (_, index) => `conversation-${index}`)),
    } as unknown as ConversationQueryRepositoryPort;
    const exportRepository = { create: vi.fn() } as unknown as ConversationExportRepositoryPort;
    const files = {} as ConversationExportFileStorePort;
    const service = new ConversationExportService(
      queryService as unknown as ConversationQueryService,
      queryRepository,
      exportRepository,
      files,
    );

    await expect(service.create({ format: 'json', filters: {} })).rejects.toMatchObject({
      response: { code: 'conversation-export-limit-exceeded' }, status: 422,
    });
    expect(exportRepository.create).not.toHaveBeenCalled();
  });
});
