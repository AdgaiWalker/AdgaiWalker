import type { ReadStream } from 'node:fs';
import type { ConversationExportFormat } from '@walker/shared';

export const CONVERSATION_EXPORT_FILE_STORE = Symbol('CONVERSATION_EXPORT_FILE_STORE');

export type ConversationExportFile = { stream: ReadStream; byteLength: number };

export interface ConversationExportFileStorePort {
  write(id: string, format: ConversationExportFormat, chunks: AsyncIterable<string>): Promise<void>;
  open(id: string, format: ConversationExportFormat): Promise<ConversationExportFile>;
  remove(id: string): Promise<void>;
  cleanupTemporary(): Promise<void>;
  reconcile(readyArtifacts: Array<{ id: string; format: ConversationExportFormat }>): Promise<void>;
}
