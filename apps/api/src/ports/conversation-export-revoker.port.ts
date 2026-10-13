export const CONVERSATION_EXPORT_REVOKER = Symbol('CONVERSATION_EXPORT_REVOKER');

export interface ConversationExportRevokerPort {
  revokeAndRemove(id: string): Promise<void>;
}
