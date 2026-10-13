import type { ConversationLogDetail, ConversationLogPage } from '@walker/shared';

export const CONVERSATION_QUERY_REPOSITORY = Symbol('CONVERSATION_QUERY_REPOSITORY');

export type ConversationQueryCursor = { updatedAt: Date; id: string };

export type ConversationQueryFilter = {
  limit: 50 | 100;
  retentionCutoff: Date;
  snapshotAt?: Date;
  cursor: ConversationQueryCursor | null;
  from: Date | null;
  toExclusive: Date | null;
  contentSlug: string | null;
  placementKey: string | null;
  agentId: string | null;
  runState: string | null;
  keyword: string | null;
};

export type ConversationQuerySnapshotFilter = Omit<ConversationQueryFilter, 'cursor' | 'limit'>;

export interface ConversationQueryRepositoryPort {
  health(): Promise<void>;
  list(input: ConversationQueryFilter): Promise<ConversationLogPage>;
  snapshotIds(input: ConversationQueryFilter, limit: number): Promise<string[]>;
  detail(conversationId: string, retentionCutoff: Date, asOf?: Date): Promise<ConversationLogDetail | null>;
}
