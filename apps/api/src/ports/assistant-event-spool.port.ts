import type { ConversationRepositoryPort } from './conversation.repository';

export const ASSISTANT_EVENT_SPOOL = Symbol('ASSISTANT_EVENT_SPOOL');

export type AssistantEventRecordInput = Parameters<ConversationRepositoryPort['recordEvent']>[0];
export type AssistantEventSpoolEntry = { event: AssistantEventRecordInput; queuedAt: string };
export type AssistantEventSpoolResource = { eventId: string; conversationId: string | null; queuedAt: string };
export type AssistantEventSpoolResult = 'queued' | 'duplicate' | 'dropped';

export type AssistantEventSpoolHealth = {
  status: 'healthy' | 'backlog' | 'loss-unknown';
  queuedCount: number | null;
  queuedBytes: number | null;
  oldestQueuedAt: string | null;
  /** Exact dropped count is intentionally null when the disk state cannot prove it. */
  droppedCount: number | null;
};

export interface AssistantEventSpoolPort {
  enqueue(event: AssistantEventRecordInput): Promise<AssistantEventSpoolResult>;
  readBatch(limit: number): Promise<AssistantEventSpoolEntry[]>;
  listResources(): Promise<AssistantEventSpoolResource[]>;
  remove(eventIds: string[]): Promise<void>;
  health(): Promise<AssistantEventSpoolHealth>;
}
