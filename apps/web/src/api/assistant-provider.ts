/**
 * assistant-provider.ts
 *
 * 对齐 Ant Design X Chat Provider 架构规范：
 * 将底层 SSE 增量解包、Thinking 过滤、流式生命周期事件与参数转换收敛为统一的 Provider。
 */
import {
  extractStreamedAnswer,
  type AssistantStreamAccepted,
  type NextStepAction,
} from '@walker/shared';
import { publicApi, type AssistantRequestContext, type AssistantResult } from './public-api';

export interface AssistantChatInput {
  body: string;
  sessionId?: string | null;
  context?: AssistantRequestContext;
}

export type AssistantUserMessage = {
  role: 'user';
  text: string;
  id?: string;
};

export type AssistantAssistantMessage = {
  role: 'assistant';
  text: string;
  citations: string[];
  aiUsedFlag: boolean;
  member?: { name: string; revision: number } | null;
  delivery?: string;
  hidden?: boolean;
  id?: string;
  restored?: boolean;
  stopped?: boolean;
  partial?: boolean;
  nextStep?: NextStepAction | null;
  quickReplies?: string[];
};

export type AssistantChatMessage = AssistantUserMessage | AssistantAssistantMessage;

export interface ChatProviderCallbacks {
  onDelta?: (delta: string) => void;
  onAccepted?: (event: AssistantStreamAccepted) => void;
  onSuccess?: (result: AssistantResult) => void;
  onError?: (error: unknown) => void;
}

/**
 * AssistantChatProvider
 * 提供 Ant Design X 风格的 Chat Provider 接口：
 * - transformParams: 参数与上下文规格化
 * - transformLocalMessage: 本地用户消息转换
 * - transformMessage: 增量与流式文本累加过滤
 * - transformCompletedMessage: 终态消息合成
 */
export class AssistantChatProvider {
  /** 格式化请求参数 */
  transformParams(input: AssistantChatInput): AssistantChatInput {
    return {
      body: input.body.trim(),
      sessionId: input.sessionId ?? null,
      context: input.context,
    };
  }

  /** 转换本地发出的用户消息 */
  transformLocalMessage(input: AssistantChatInput): AssistantUserMessage {
    return {
      role: 'user',
      text: input.body.trim(),
    };
  }

  /** 将流式增量累加并过滤中间思维链 */
  transformMessage(
    originMessage: AssistantAssistantMessage | undefined,
    accumulatedText: string,
  ): AssistantAssistantMessage {
    const visible = extractStreamedAnswer(accumulatedText) || accumulatedText;
    return {
      role: 'assistant',
      text: visible,
      citations: originMessage?.citations ?? [],
      aiUsedFlag: originMessage?.aiUsedFlag ?? false,
      member: originMessage?.member ?? null,
      id: originMessage?.id,
      delivery: originMessage?.delivery,
      stopped: originMessage?.stopped,
      partial: originMessage?.partial,
      nextStep: originMessage?.nextStep,
      quickReplies: originMessage?.quickReplies,
    };
  }

  /** 将终态结果融合进助手消息 */
  transformCompletedMessage(
    originMessage: AssistantAssistantMessage | undefined,
    done: AssistantResult,
    member?: { name: string; revision: number } | null,
  ): AssistantAssistantMessage {
    return {
      role: 'assistant',
      text: done.answer,
      citations: done.citations.map((c) => c.slug),
      aiUsedFlag: done.aiUsedFlag,
      member: done.aiUsedFlag ? (member ?? null) : null,
      delivery: 'sent',
      id: done.messageId,
      ...(done.partial ? { partial: true } : {}),
      nextStep: done.nextStep,
      quickReplies: done.quickReplies,
      hidden: originMessage?.hidden,
    };
  }

  /** 执行流式请求并驱动回调 */
  async requestStream(
    input: AssistantChatInput,
    callbacks: ChatProviderCallbacks,
    signal?: AbortSignal,
  ): Promise<AssistantResult> {
    const params = this.transformParams(input);
    return publicApi.assistantStream({
      body: params.body,
      sessionId: params.sessionId ?? null,
      source: 'assistant-stream',
      onText: (delta) => {
        callbacks.onDelta?.(delta);
      },
      onAccepted: (event) => {
        callbacks.onAccepted?.(event);
      },
      context: params.context,
      signal,
    });
  }
}

export const assistantChatProvider = new AssistantChatProvider();
