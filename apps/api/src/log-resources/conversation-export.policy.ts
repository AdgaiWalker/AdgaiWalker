export const CONVERSATION_EXPORT_MAX_ROWS = 10_000;
export const CONVERSATION_EXPORT_TTL_MS = 15 * 60 * 1_000;

export function conversationExportExpiresAt(snapshotAt: Date): Date {
  return new Date(snapshotAt.getTime() + CONVERSATION_EXPORT_TTL_MS);
}
