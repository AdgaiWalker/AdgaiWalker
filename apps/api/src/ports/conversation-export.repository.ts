import type { ConversationExportFilters, ConversationExportFormat, ConversationExportState } from '@walker/shared';

export const CONVERSATION_EXPORT_REPOSITORY = Symbol('CONVERSATION_EXPORT_REPOSITORY');

export type ConversationExportRecord = {
  id: string;
  format: ConversationExportFormat;
  status: ConversationExportState;
  filters: ConversationExportFilters;
  snapshotAt: Date;
  retentionCutoff: Date;
  rowCount: number;
  errorCode: string | null;
};

export type CreateConversationExport = {
  id: string;
  format: ConversationExportFormat;
  filters: ConversationExportFilters;
  snapshotAt: Date;
  retentionCutoff: Date;
  conversationIds: string[];
};

export interface ConversationExportRepositoryPort {
  create(input: CreateConversationExport): Promise<ConversationExportRecord>;
  find(id: string): Promise<ConversationExportRecord | null>;
  pendingIds(now: Date, limit: number): Promise<string[]>;
  snapshotConversationIds(exportId: string): Promise<string[]>;
  claim(id: string): Promise<ConversationExportRecord | null>;
  complete(id: string, now: Date): Promise<boolean>;
  fail(id: string, errorCode: string): Promise<void>;
  revoke(id: string, reason: 'conversation-deleted'): Promise<void>;
  expire(id: string, now: Date): Promise<void>;
  expiredIds(now: Date, limit: number): Promise<string[]>;
  readyArtifacts(now: Date): Promise<Array<{ id: string; format: ConversationExportFormat }>>;
  requeueInterrupted(): Promise<void>;
  recordDownload(id: string, now: Date): Promise<ConversationExportState | 'MISSING'>;
}
