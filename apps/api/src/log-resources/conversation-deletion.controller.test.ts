import { describe, expect, it, vi } from 'vitest';
import { ConversationDeletionController } from './conversation-deletion.controller';
import type { ConversationDeletionService } from './conversation-deletion.service';

describe('ConversationDeletionController', () => {
  it('deletes by logical conversation ID and exposes task status by tombstone ID', async () => {
    const service = {
      requestDelete: vi.fn(async () => ({ id: 'tombstone-1', conversationId: 'conversation-1', state: 'completed' })),
      taskStatus: vi.fn(async () => ({ id: 'tombstone-1', state: 'completed' })),
    } as unknown as ConversationDeletionService;
    const controller = new ConversationDeletionController(service);

    await expect(controller.deleteConversation('conversation-1')).resolves.toMatchObject({ state: 'completed' });
    await expect(controller.taskStatus('tombstone-1')).resolves.toMatchObject({ id: 'tombstone-1' });
    expect(service.requestDelete).toHaveBeenCalledWith('conversation-1', 'owner');
    expect(service.taskStatus).toHaveBeenCalledWith('tombstone-1');
  });
});
