import type { NewActionRecord } from './action.repository';

/** One authoritative write for a conversation-derived Action and its request-key audit. */
export interface ConversationActionCommitPort {
  findByRequestKey(requestKey: string): Promise<string | null>;
  commit(input: { action: NewActionRecord; requestKey: string; actor: string }): Promise<{ actionId: string; replayed: boolean }>;
}

export const CONVERSATION_ACTION_COMMIT = Symbol('CONVERSATION_ACTION_COMMIT');
