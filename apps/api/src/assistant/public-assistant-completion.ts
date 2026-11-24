import {
  ASSISTANT_ANSWER_MIN_LENGTH,
  diagnoseAssistantOutput,
  extractStreamedAnswer,
  type AssistantRunResult,
  type DegradeReason,
} from '@walker/shared';
import { newId } from '../common/ids';
import type { AssistantRepositoryPort } from '../ports/assistant.repository';
import type { ConversationRepositoryPort } from '../ports/conversation.repository';
import { stableAssistantId, todayCN } from './assistant-common';
import type {
  AnswerDelivery,
  ConversationContext,
  PublicAssistantAskInput,
  PublicAssistantAskResult,
  PublicAssistantGate,
} from './public-assistant-stream';

export interface CompletedModelExecutionView {
  runId: string;
  output: string;
  partial?: boolean;
  sessionId: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  elapsedMs: number | null;
}

/** 完成一次问答的结果落库、会话记录与指标打点，并组装前端响应对象。 */
export async function finishPublicAssistantRun(
  deps: {
    conversations: Pick<ConversationRepositoryPort, 'setAssistantMessage' | 'setAttemptState'>;
    repo: Pick<AssistantRepositoryPort, 'upsertSession' | 'saveRun' | 'addTokens'>;
    waitPersistence: (work: Promise<unknown>) => Promise<void>;
    safeEvent: (input: {
      featureKey: string;
      event: 'expose' | 'attempt' | 'success' | 'fail';
      actorType: 'guest' | 'user' | 'owner';
      failCode?: string | null;
      props?: Record<string, unknown> | null;
      conversationId?: string | null;
    }) => Promise<void> | void;
    resolvedConversationId: string | null;
  },
  options: {
    input: PublicAssistantAskInput;
    gate: PublicAssistantGate;
    result: AssistantRunResult;
    agentRevisionId?: string;
    runId: string | null;
    conversation: ConversationContext | null;
  },
): Promise<PublicAssistantAskResult> {
  const { input, gate, result, agentRevisionId, runId, conversation } = options;
  await deps.waitPersistence((async () => {
    if (conversation) {
      await deps.conversations.setAssistantMessage({
        id: gate.messageId,
        body: result.answer,
        delivery: 'pending',
        ...(conversation.attemptId ? { attemptId: conversation.attemptId } : {}),
      });
      if (conversation.attemptId) {
        await deps.conversations.setAttemptState(conversation.attemptId, result.aiUsedFlag ? 'generated' : 'fallback');
      }
    }
    await deps.repo.upsertSession({
      id: newId(),
      anonId: gate.anonHash,
      sessionId: result.sessionId,
      runner: result.aiUsedFlag ? 'harness' : 'rule',
      agentRevisionId: result.aiUsedFlag ? agentRevisionId ?? null : null,
      conversationId: deps.resolvedConversationId,
    });
    await deps.repo.saveRun({
      id: newId(),
      sessionId: result.sessionId,
      question: gate.redactedText,
      answer: result.answer,
      citations: JSON.stringify(result.citations.map((citation) => citation.slug)),
      aiUsedFlag: result.aiUsedFlag,
      elapsedMs: result.elapsedMs,
      traceId: null,
      source: input.source ?? 'assistant-panel',
      anonIdHash: gate.anonHash,
      requestKey: gate.requestKey,
      tokensIn: result.usage?.inputTokens ?? 0,
      tokensOut: result.usage?.outputTokens ?? 0,
      cacheReadTokens: result.usage?.cacheReadTokens ?? 0,
      firstChunkMs: result.firstChunkMs ?? null,
      queueWaitMs: result.queueWaitMs ?? null,
      degradeReason: result.degradeReason ?? null,
      conversationId: deps.resolvedConversationId,
    });
    if (result.usage) {
      await deps.repo.addTokens(todayCN(), { tokensIn: result.usage.inputTokens, tokensOut: result.usage.outputTokens });
    }
  })());
  void deps.safeEvent({
    featureKey: 'assistant.ask',
    event: 'success',
    actorType: gate.actorType,
    conversationId: deps.resolvedConversationId,
    props: { aiUsedFlag: result.aiUsedFlag, citations: result.citations.length, elapsedMs: result.elapsedMs },
  });
  return {
    sessionId: result.sessionId,
    answer: result.answer,
    citations: result.citations,
    aiUsedFlag: result.aiUsedFlag,
    ...(result.partial ? { partial: true } : {}),
    elapsedMs: result.elapsedMs,
    requestId: gate.requestId,
    messageId: gate.messageId,
    attemptId: gate.attemptId,
    runId,
    conversationId: conversation?.id ?? null,
    nextStep: result.nextStep ?? null,
    quickReplies: result.quickReplies,
  };
}

/** 校验并交付模型输出；遇到坏输出或无正文时回退规则回答，否则保留 partial/完整答案（由 finish 统一收敛消息与 Attempt 状态）。 */
export async function completePublicModelAnswer(
  deps: {
    conversations: Pick<ConversationRepositoryPort, 'linkSdkSession'>;
    waitPersistence: (work: Promise<unknown>) => Promise<void>;
    fallbackAnswer: (reason: DegradeReason) => Promise<PublicAssistantAskResult>;
    finish: (options: {
      result: AssistantRunResult;
      agentRevisionId: string;
      runId: string;
      conversation: ConversationContext | null;
    }) => Promise<PublicAssistantAskResult>;
  },
  options: {
    delivery: AnswerDelivery;
    agentRevisionId: string;
    execution: CompletedModelExecutionView;
    citableSlugs: ReadonlySet<string>;
    startedAt: number;
  },
): Promise<PublicAssistantAskResult> {
  const { delivery, agentRevisionId, execution, citableSlugs, startedAt } = options;
  const diagnosis = diagnoseAssistantOutput(execution.output, citableSlugs);
  const partialAnswer = !diagnosis.ok && execution.partial
    ? extractStreamedAnswer(execution.output).trim()
    : '';
  if (!diagnosis.ok && partialAnswer.length < ASSISTANT_ANSWER_MIN_LENGTH) {
    return deps.fallbackAnswer('bad-output');
  }

  const result: AssistantRunResult = {
    answer: diagnosis.ok ? diagnosis.value.answer : partialAnswer,
    citations: diagnosis.ok ? diagnosis.value.citations : [],
    sessionId: execution.sessionId ?? execution.runId,
    aiUsedFlag: true,
    elapsedMs: execution.elapsedMs ?? Date.now() - startedAt,
    ...(execution.tokensIn !== null && execution.tokensOut !== null
      ? { usage: { inputTokens: execution.tokensIn, outputTokens: execution.tokensOut } }
      : {}),
    ...(diagnosis.ok ? {} : { partial: true }),
  };
  if (delivery.state.conversation && execution.sessionId) {
    await deps.waitPersistence(deps.conversations.linkSdkSession({
      id: stableAssistantId(delivery.state.conversation.id, agentRevisionId, 'conversation-sdk'),
      conversationId: delivery.state.conversation.id,
      agentRevisionId,
      sdkSessionId: execution.sessionId,
    }).catch(() => {}));
  }
  await deps.waitPersistence(delivery.waitWrites());
  const finished = await deps.finish({
    result,
    agentRevisionId,
    runId: execution.runId,
    conversation: delivery.state.conversation,
  });
  delivery.emitDone(finished);
  return finished;
}
