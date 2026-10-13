import { Inject, Injectable } from '@nestjs/common';
import { CONVERSATION_DELETION_REPOSITORY, type ConversationDeletionRepositoryPort } from '../ports/conversation-deletion.repository';
import { LOG_RESOURCE_CLEANER, type LogResourceCleanerPort } from '../ports/log-resource-cleaner.port';
import { LOG_RESOURCE_REPOSITORY, type LogResourceRepositoryPort } from '../ports/log-resource.repository';
import { ConversationDeletionService, FILE_RESOURCE_TYPES } from './conversation-deletion.service';
import { LogResourceService } from './log-resource.service';

const CLEANUP_BATCH_LIMIT = 1_000;
const CLEANUP_PASS_LIMIT = 10_000;

@Injectable()
export class LogRetentionCleanupService {
  constructor(
    @Inject(LogResourceService) private readonly logs: LogResourceService,
    @Inject(ConversationDeletionService) private readonly deletions: ConversationDeletionService,
    @Inject(LOG_RESOURCE_CLEANER) private readonly cleaner: LogResourceCleanerPort,
    @Inject(LOG_RESOURCE_REPOSITORY) private readonly resources: LogResourceRepositoryPort,
    @Inject(CONVERSATION_DELETION_REPOSITORY) private readonly deletionRepository: ConversationDeletionRepositoryPort,
  ) {}

  async cleanupExpired(now = new Date()): Promise<{ conversations: number; resources: number }> {
    let conversations = 0;
    let resources = 0;

    for (let pass = 0; pass < CLEANUP_PASS_LIMIT; pass += 1) {
      const expired = await this.logs.expiredResources(now, CLEANUP_BATCH_LIMIT);
      if (expired.length === 0) return { conversations, resources };

      const conversationIds = [...new Set(expired.flatMap((resource) => resource.conversationId ? [resource.conversationId] : []))];
      for (const conversationId of conversationIds) {
        const task = await this.deletions.requestDelete(conversationId, 'retention-policy');
        if (task.state !== 'completed') throw new Error('retention-cleanup-incomplete');
        conversations += 1;
      }

      for (const resource of expired.filter((item) => !item.conversationId)) {
        if (FILE_RESOURCE_TYPES.has(resource.resourceType)) await this.cleaner.remove(resource);
        await this.deletionRepository.deleteDatabaseResource(resource);
        await this.resources.deleteResourceRecord(resource.id);
        resources += 1;
      }
    }

    throw new Error('retention-cleanup-pass-limit');
  }
}
