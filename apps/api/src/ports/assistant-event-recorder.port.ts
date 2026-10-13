import type { AssistantEventRecordInput, AssistantEventSpoolHealth } from './assistant-event-spool.port';

export const ASSISTANT_EVENT_RECORDER = Symbol('ASSISTANT_EVENT_RECORDER');

export type AssistantEventRecordResult = {
  recorded: boolean;
  duplicate: boolean;
  queued: boolean;
};

export interface AssistantEventRecorderPort {
  record(event: AssistantEventRecordInput): Promise<AssistantEventRecordResult>;
  replayOnce(): Promise<{ replayed: number; pending: number | null }>;
  health(): Promise<AssistantEventSpoolHealth>;
}
