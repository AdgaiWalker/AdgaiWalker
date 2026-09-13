import type { AssistantMessage } from '../../hooks/useAssistant';

export type PetActivity =
  | 'idle'
  | 'listening'
  | 'searching'
  | 'thinking'
  | 'speaking'
  | 'complete'
  | 'fallback'
  | 'error'
  | 'stopped';

/** Idle companion vs retrieval/answer work. Searching is the retrieval working state. */
export function isPetWorking(activity: PetActivity): boolean {
  return activity === 'searching' || activity === 'thinking' || activity === 'speaking';
}

/** Derive presentation from the actual request, never from an animation timer. */
export function getPetActivity(
  loading: boolean,
  error: string | null,
  messages: readonly AssistantMessage[],
  editing = false,
  searching = false,
): PetActivity {
  const last = messages[messages.length - 1];
  if (loading) return last?.role === 'assistant' && last.text ? 'speaking' : 'thinking';
  if (error) return 'error';
  if (searching) return 'searching';
  if (editing) return 'listening';
  if (last?.role === 'assistant') {
    if (last.stopped) return 'stopped';
    return last.aiUsedFlag ? 'complete' : 'fallback';
  }
  return 'idle';
}
