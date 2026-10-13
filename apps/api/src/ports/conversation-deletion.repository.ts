import type { LogResourceRecord } from './log-resource.repository';

export const CONVERSATION_DELETION_REPOSITORY = Symbol('CONVERSATION_DELETION_REPOSITORY');

export type DeletionConversation = {
  id: string;
  anonId: string;
  placementKey: string;
  scopeSlug: string;
  runIds: string[];
};

export interface ConversationDeletionRepositoryPort {
  conversation(id: string): Promise<DeletionConversation | null>;
  deleteDatabaseResource(resource: LogResourceRecord): Promise<void>;
  finalizeConversation(conversationId: string, tombstoneId: string): Promise<void>;
}
