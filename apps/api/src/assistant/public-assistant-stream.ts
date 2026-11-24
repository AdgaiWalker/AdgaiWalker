import {
  assistantStreamEventId,
  type AssistantRunResult,
  type AssistantStreamAccepted,
  type AssistantStreamDelta,
  type AssistantStreamDone,
  type AssistantStreamError,
} from '@walker/shared';
import { ApiError } from '../common/http-error';
import type { ConversationRepositoryPort } from '../ports/conversation.repository';

export interface PublicAssistantAskInput {
  body: string;
  source?: string;
  anonId: string;
  ipKey: string;
  sessionId?: string | null;
  requestKey?: string | null;
  requestId?: string;
  conversationId?: string | null;
  placementKey?: string | null;
  scopeSlug?: string | null;
  memberKey?: string | null;
  deploymentGeneration?: number | null;
  signal?: AbortSignal;
}

export interface PublicAssistantAskResult {
  sessionId: string;
  answer: string;
  citations: { slug: string }[];
  aiUsedFlag: boolean;
  /** 回答没写完（模型还在生成时到了运行预算）。已经生成的部分照常交付，不换成规则文案。 */
  partial?: boolean;
  elapsedMs: number;
  requestId: string;
  messageId: string;
  attemptId: string;
  runId: string | null;
  conversationId: string | null;
  nextStep?: AssistantRunResult['nextStep'];
  quickReplies?: string[];
}

export interface PublicAssistantStreamSink {
  accepted(event: AssistantStreamAccepted): void;
  delta(event: AssistantStreamDelta): void;
  done(event: AssistantStreamDone): void;
  error(event: AssistantStreamError): void;
}

export type PublicAssistantGate = {
  actorType: 'guest' | 'user';
  anonHash: string;
  requestKey: string;
  requestId: string;
  messageId: string;
  attemptId: string;
  redactedText: string;
  duplicate: PublicAssistantAskResult | null;
};

export type ConversationContext = {
  id: string;
  turnId: string;
  attemptId: string | null;
};

export type AnswerDelivery = {
  state: { conversation: ConversationContext | null; runId: string | null; streamedText: string };
  emitDelta: (delta: string) => void;
  emitDone: (result: PublicAssistantAskResult) => void;
  emitError: (reason: 'client-abort' | 'user-stopped') => void;
  waitWrites: () => Promise<void>;
};

/** 发出流式 accepted 起始帧；写入异常时交由后续交付状态机收敛。 */
export function emitAcceptedFrame(gate: PublicAssistantGate, stream?: PublicAssistantStreamSink): void {
  if (!stream) return;
  try {
    stream.accepted({
      version: 2,
      type: 'accepted',
      eventId: assistantStreamEventId(gate.messageId, 0),
      requestId: gate.requestId,
      messageId: gate.messageId,
      attemptId: gate.attemptId,
      runId: null,
      sequence: 0,
    });
  } catch { /* 写入失败时交付状态由 V11.b 收敛 */ }
}

/** 根据已完成的问答结果构造三段标准回放帧（accepted → delta → done）。 */
export function completedStreamFrames(
  result: PublicAssistantAskResult,
  acceptedRunId: string | null,
): {
  accepted: AssistantStreamAccepted;
  delta: AssistantStreamDelta;
  done: AssistantStreamDone;
} {
  const identity = {
    requestId: result.requestId,
    messageId: result.messageId,
    attemptId: result.attemptId,
  };
  return {
    accepted: {
      version: 2,
      type: 'accepted',
      eventId: assistantStreamEventId(result.messageId, 0),
      ...identity,
      runId: acceptedRunId,
      sequence: 0,
    },
    delta: {
      version: 2,
      type: 'delta',
      eventId: assistantStreamEventId(result.messageId, 1),
      ...identity,
      runId: result.runId,
      sequence: 1,
      delta: result.answer,
    },
    done: {
      version: 2,
      type: 'done',
      eventId: assistantStreamEventId(result.messageId, 2),
      ...identity,
      runId: result.runId,
      sequence: 2,
      result,
    },
  };
}

/** 将既有完成结果直接回放到并发订阅的流式接收端。 */
export function replayStreamFrames(result: PublicAssistantAskResult, stream?: PublicAssistantStreamSink): void {
  if (!stream) return;
  const frames = completedStreamFrames(result, result.runId);
  try {
    stream.accepted(frames.accepted);
    stream.delta(frames.delta);
    stream.done(frames.done);
  } catch { /* 写入失败时交付状态由 V11.b 收敛 */ }
}

/** 创建单次问答的流式帧分发器与增量消息落库队列。 */
export function createAnswerDelivery(
  deps: { conversations: Pick<ConversationRepositoryPort, 'setAssistantMessage'> },
  gate: PublicAssistantGate,
  stream: PublicAssistantStreamSink | undefined,
  conversation: ConversationContext | null,
): AnswerDelivery {
  const state: AnswerDelivery['state'] = { conversation, runId: null, streamedText: '' };
  let sequence = 0;
  let messageWrites = Promise.resolve();
  return {
    state,
    emitDelta: (delta) => {
      if (!stream || !delta) return;
      state.streamedText += delta;
      sequence += 1;
      try {
        stream.delta({
          version: 2,
          type: 'delta',
          eventId: assistantStreamEventId(gate.messageId, sequence),
          requestId: gate.requestId,
          messageId: gate.messageId,
          attemptId: gate.attemptId,
          runId: state.runId,
          sequence,
          delta,
        });
      } catch { /* 写入失败时交付状态由 V11.b 收敛 */ }
      if (state.conversation) {
        const body = state.streamedText;
        messageWrites = messageWrites
          .then(() => deps.conversations.setAssistantMessage({
            id: gate.messageId,
            body,
            delivery: 'partial',
            ...(state.conversation?.attemptId ? { attemptId: state.conversation.attemptId } : {}),
          }))
          .catch(() => {});
      }
    },
    emitDone: (result) => {
      if (!stream) return;
      sequence += 1;
      try {
        stream.done({
          version: 2,
          type: 'done',
          eventId: assistantStreamEventId(gate.messageId, sequence),
          requestId: gate.requestId,
          messageId: gate.messageId,
          attemptId: gate.attemptId,
          runId: result.runId,
          sequence,
          result,
        });
      } catch { /* 写入失败时交付状态由 V11.b 收敛 */ }
    },
    emitError: (reason) => {
      if (!stream) return;
      sequence += 1;
      try {
        stream.error({
          version: 2,
          type: 'error',
          eventId: assistantStreamEventId(gate.messageId, sequence),
          requestId: gate.requestId,
          messageId: gate.messageId,
          attemptId: gate.attemptId,
          runId: state.runId,
          sequence,
          code: reason === 'user-stopped' ? 'user-stopped' : 'client-abort',
          message: reason === 'user-stopped' ? '回答已停止。' : '连接已断开，本次回答未确认送达。',
        });
      } catch { /* 已断开连接 */ }
    },
    waitWrites: () => messageWrites,
  };
}

/** 幂等重复请求回放：确保绑定会话并向当前流补齐三帧。 */
export async function deliverDuplicateAnswer(
  deps: {
    conversations: Pick<ConversationRepositoryPort, 'setAssistantMessage'>;
    ensureConversation: () => Promise<ConversationContext | null>;
  },
  options: {
    gate: PublicAssistantGate;
    prior: PublicAssistantAskResult;
    modelAvailable: boolean;
    stream?: PublicAssistantStreamSink;
  },
): Promise<PublicAssistantAskResult> {
  const { gate, prior, modelAvailable, stream } = options;
  const isFastPath = prior.sessionId?.startsWith('jev-fast-path-');
  if (prior.aiUsedFlag && !modelAvailable && !isFastPath) {
    throw new ApiError('placement-generation-conflict', 409, '公开成员列表已更新，请刷新后重试');
  }
  const conversation = await deps.ensureConversation();
  const result = { ...prior, conversationId: conversation?.id ?? null };
  const frames = completedStreamFrames(result, null);
  if (stream) {
    try { stream.accepted(frames.accepted); } catch { /* 接收端已断开 */ }
  }
  if (conversation) {
    await deps.conversations.setAssistantMessage({
      id: gate.messageId,
      body: result.answer,
      delivery: 'pending',
      ...(conversation.attemptId ? { attemptId: conversation.attemptId } : {}),
    }).catch(() => {});
  }
  if (stream) {
    try { stream.delta(frames.delta); } catch { /* 接收端已断开 */ }
    try { stream.done(frames.done); } catch { /* 接收端已断开 */ }
  }
  return result;
}

/** 终止或断连时的部分结果收敛与流式 error 帧输出。 */
export async function deliverStoppedAnswer(
  deps: {
    conversations: Pick<ConversationRepositoryPort, 'setAssistantMessage' | 'setAttemptState'>;
  },
  options: {
    gate: PublicAssistantGate;
    delivery: AnswerDelivery;
    reason: 'client-abort' | 'user-stopped';
    sessionId: string | null;
    startedAt: number;
  },
): Promise<PublicAssistantAskResult> {
  const { gate, delivery, reason, sessionId, startedAt } = options;
  await delivery.waitWrites();
  if (delivery.state.conversation) {
    const deliveryStatus = delivery.state.streamedText ? 'partial' : 'unknown';
    await deps.conversations.setAssistantMessage({
      id: gate.messageId,
      body: delivery.state.streamedText,
      delivery: deliveryStatus,
      ...(delivery.state.conversation.attemptId ? { attemptId: delivery.state.conversation.attemptId } : {}),
    }).catch(() => {});
    if (delivery.state.conversation.attemptId) {
      await deps.conversations.setAttemptState(delivery.state.conversation.attemptId, 'cancelled').catch(() => {});
    }
  }
  delivery.emitError(reason);
  return {
    sessionId: sessionId ?? '',
    answer: delivery.state.streamedText,
    citations: [],
    aiUsedFlag: delivery.state.streamedText.length > 0,
    elapsedMs: Date.now() - startedAt,
    requestId: gate.requestId,
    messageId: gate.messageId,
    attemptId: gate.attemptId,
    runId: delivery.state.runId,
    conversationId: delivery.state.conversation?.id ?? null,
  };
}
