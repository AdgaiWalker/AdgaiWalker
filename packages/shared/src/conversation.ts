/** 业务会话合同（V07）：turn/attempt/run/message/event 稳定 ID 与投递状态。 */

export const MESSAGE_DELIVERY_STATES = ['pending', 'partial', 'sent', 'ack', 'unknown'] as const;
export type MessageDelivery = (typeof MESSAGE_DELIVERY_STATES)[number];

export type ConversationMessageView = {
  id: string;
  turnId: string;
  attemptId: string | null;
  role: 'visitor' | 'assistant';
  body: string;
  delivery: MessageDelivery;
  createdAt: string;
};

export type ConversationAttemptView = {
  id: string;
  turnId: string;
  agentRevisionId: string;
  runId: string | null;
  state: string;
  createdAt: string;
};

export type ConversationTurnView = {
  id: string;
  conversationId: string;
  seq: number;
  requestKey: string;
  createdAt: string;
  messages: ConversationMessageView[];
  attempts: ConversationAttemptView[];
};

export type ConversationView = {
  id: string;
  anonId: string;
  placementKey: string;
  scopeSlug: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationDetailView = ConversationView & {
  turns: ConversationTurnView[];
  sdkSessions: Array<{ agentRevisionId: string; sdkSessionId: string }>;
};

/** 访客可恢复的会话投影；不包含匿名身份、SDK session、run 或修订数据库 ID。 */
export type PublicConversationHistory = {
  conversationId: string | null;
  placementKey: string;
  scopeSlug: string;
  deploymentGeneration: number | null;
  messages: Array<{
    id: string;
    role: 'visitor' | 'assistant';
    text: string;
    delivery: MessageDelivery | 'unavailable';
    createdAt: string;
    member: { name: string; revision: number } | null;
    hidden?: boolean;
    stopped?: boolean;
  }>;
};

/** 访客停止入口只返回事实状态，不暴露统一运行 ID。 */
export type PublicAssistantStopStatus = {
  state: 'PENDING' | 'CANCELLED' | 'FAILED' | 'SUCCEEDED' | 'UNKNOWN';
  confirmed: boolean;
};
