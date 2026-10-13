import type {
  ConversationAttemptView,
  ConversationDetailView,
  ConversationMessageView,
  ConversationTurnView,
  ConversationView,
  MessageDelivery,
} from '@walker/shared';

export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');

export interface ConversationRepositoryPort {
  create(input: { id: string; anonId: string; placementKey: string; scopeSlug: string }): Promise<ConversationView>;
  isDeleted(id: string): Promise<boolean>;
  detail(id: string): Promise<ConversationDetailView | null>;
  /** 访客消息幂等入库：重复 requestKey 返回既有轮次，不产生重复行。 */
  addVisitorMessage(input: {
    conversationId: string;
    turnId: string;
    messageId: string;
    requestKey: string;
    body: string;
  }): Promise<ConversationTurnView>;
  /** 一次生成尝试；重新生成单列一行，互不覆盖。 */
  addAttempt(input: { id: string; turnId: string; agentRevisionId: string; runId: string | null }): Promise<ConversationAttemptView>;
  setAttemptRunId(id: string, runId: string): Promise<void>;
  setAttemptState(id: string, state: string): Promise<void>;
  addAssistantMessage(input: { id: string; turnId: string; attemptId: string | null; body: string }): Promise<ConversationMessageView>;
  setAssistantMessage(input: { id: string; body: string; delivery: MessageDelivery; attemptId?: string | null }): Promise<void>;
  setDelivery(messageId: string, delivery: MessageDelivery): Promise<void>;
  setAssistantDeliveryForVisitor(messageId: string, anonId: string, delivery: 'sent' | 'unknown'): Promise<boolean>;
  acknowledgeMessage(messageId: string, anonId: string): Promise<'acked' | 'duplicate' | 'not-found' | 'not-sent'>;
  /** 同一会话切换成员：每个成员一行 SDK session 关联，互不串用。 */
  linkSdkSession(input: { id: string; conversationId: string; agentRevisionId: string; sdkSessionId: string }): Promise<void>;
  sdkSessionFor(conversationId: string, agentRevisionId: string): Promise<string | null>;
  /** 事件幂等入库：重复 eventId 不产生重复行；接收时间由服务端写。 */
  recordEvent(input: {
    id: string;
    eventId: string;
    featureKey: string;
    event: string;
    actorType: string;
    failCode?: string | null;
    conversationId?: string | null;
    props?: unknown;
  }): Promise<'recorded' | 'duplicate'>;
}
