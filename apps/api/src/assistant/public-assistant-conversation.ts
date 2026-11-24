import {
  ASSISTANT_INTERACTION_FEATURE_KEY,
  FEATURE_FAIL_CODES,
  RATE_LIMITS,
  findPlacement,
  isValidAssistantBody,
  parseAssistantInteraction,
  placementContentAvailable,
  redactSensitiveText,
  type PublicAssistantStopStatus,
  type PublicConversationHistory,
  type PublicPlacementManifest,
} from '@walker/shared';
import { randomUUID } from 'node:crypto';
import { hashAnonId } from '../auth/anon-cookie';
import { sha256Hex } from '../common/crypto';
import { ApiError, rateLimited, validationError } from '../common/http-error';
import { newId } from '../common/ids';
import type { StopResult } from '../execution/execution-lifecycle';
import type { AssistantEventRecorderPort } from '../ports/assistant-event-recorder.port';
import type { AssistantRepositoryPort } from '../ports/assistant.repository';
import type { ConversationRepositoryPort } from '../ports/conversation.repository';
import type { RateLimitPort } from '../ports/rate-limit.port';
import type { SiteContentIndexPort } from '../ports/site-content-index.port';
import { MESSAGE_ID_RE, REQUEST_KEY_RE, SCOPE_SLUG_RE, stableAssistantId } from './assistant-common';
import type {
  ConversationContext,
  PublicAssistantAskInput,
  PublicAssistantGate,
} from './public-assistant-stream';

export interface PublicDeploymentHistoryAccess {
  generation: number | null;
  revisions: Map<string, { name: string; revision: number }>;
}

/** 统一校验已载入会话是否归属同一匿名访客、位置与内容范围。 */
export function matchesConversationOwner(
  detail: { anonId: string; placementKey: string; scopeSlug: string } | null | undefined,
  anonHash: string,
  placementKey: string,
  scopeSlug: string,
): boolean {
  return Boolean(
    detail &&
    detail.anonId === anonHash &&
    detail.placementKey === placementKey &&
    detail.scopeSlug === scopeSlug,
  );
}

/** 根据请求入参解析逻辑会话 ID；位置或范围非法时返回 null。 */
export function resolveLogicalConversationId(
  input: Pick<PublicAssistantAskInput, 'placementKey' | 'scopeSlug'>,
  anonHash: string,
): string | null {
  const placementKey = input.placementKey?.trim() ?? '';
  const scopeSlug = input.scopeSlug?.trim() ?? '';
  if (!findPlacement(placementKey) || !SCOPE_SLUG_RE.test(scopeSlug)) return null;
  return stableAssistantId(anonHash, `${placementKey}\n${scopeSlug}`, 'conversation');
}

/** 确保当前提问绑定到有效会话并落入访客/助手占位消息。 */
export async function ensureVisitorConversation(
  conversations: Pick<ConversationRepositoryPort, 'detail' | 'create' | 'addVisitorMessage' | 'addAssistantMessage'>,
  input: Pick<PublicAssistantAskInput, 'placementKey' | 'scopeSlug' | 'conversationId'>,
  gate: Pick<PublicAssistantGate, 'anonHash' | 'requestKey' | 'redactedText' | 'messageId'>,
): Promise<ConversationContext | null> {
  const placementKey = input.placementKey?.trim() ?? '';
  const scopeSlug = input.scopeSlug?.trim() ?? '';
  if (!findPlacement(placementKey) || !SCOPE_SLUG_RE.test(scopeSlug)) return null;

  try {
    let conversation: { id: string; anonId: string; placementKey: string; scopeSlug: string } | null = input.conversationId
      ? await conversations.detail(input.conversationId).catch(() => null)
      : null;
    if (conversation && !matchesConversationOwner(conversation, gate.anonHash, placementKey, scopeSlug)) {
      conversation = null;
    }
    if (!conversation) {
      const id = stableAssistantId(gate.anonHash, `${placementKey}\n${scopeSlug}`, 'conversation');
      conversation = await conversations.detail(id);
      if (!conversation) {
        try {
          conversation = await conversations.create({ id, anonId: gate.anonHash, placementKey, scopeSlug });
        } catch {
          conversation = await conversations.detail(id);
        }
      }
    }
    if (!conversation || !matchesConversationOwner(conversation, gate.anonHash, placementKey, scopeSlug)) return null;

    const turnKey = `${conversation.id}\n${gate.requestKey}`;
    const turn = await conversations.addVisitorMessage({
      conversationId: conversation.id,
      turnId: stableAssistantId(gate.anonHash, turnKey, 'turn'),
      messageId: stableAssistantId(gate.anonHash, turnKey, 'visitor'),
      requestKey: gate.requestKey,
      body: gate.redactedText,
    });
    if (!turn.messages.some((message) => message.id === gate.messageId)) {
      await conversations.addAssistantMessage({ id: gate.messageId, turnId: turn.id, attemptId: null, body: '' });
    }
    return { id: conversation.id, turnId: turn.id, attemptId: null };
  } catch {
    return null;
  }
}

/** 为模型生成尝试创建 Attempt 并关联待输出助手消息。 */
export async function attachConversationAttempt(
  conversations: Pick<ConversationRepositoryPort, 'addAttempt' | 'setAssistantMessage'>,
  conversation: ConversationContext | null,
  gate: Pick<PublicAssistantGate, 'attemptId' | 'messageId'>,
  agentRevisionId: string,
): Promise<ConversationContext | null> {
  if (!conversation) return null;
  try {
    await conversations.addAttempt({ id: gate.attemptId, turnId: conversation.turnId, agentRevisionId, runId: null });
    await conversations.setAssistantMessage({ id: gate.messageId, body: '', delivery: 'pending', attemptId: gate.attemptId });
    return { ...conversation, attemptId: gate.attemptId };
  } catch {
    return conversation;
  }
}

/** 读取访客在指定位置与内容下的可见会话历史，隐藏非当前公开成员的旧回答正文。 */
export async function loadVisitorConversationHistory(
  deps: {
    content: Pick<SiteContentIndexPort, 'loadCitableSnapshot'>;
    conversations: Pick<ConversationRepositoryPort, 'isDeleted' | 'detail'>;
    deployments: { publicHistoryMembers(placementKey: string, scopeSlug: string): Promise<PublicDeploymentHistoryAccess> };
  },
  anonId: string,
  placementKey: string,
  scopeSlug: string,
): Promise<PublicConversationHistory> {
  if (!findPlacement(placementKey)) throw new ApiError('placement-not-found', 404, '找不到这个访客位置');
  if (!SCOPE_SLUG_RE.test(scopeSlug)) throw validationError('assistant-scope-invalid');
  const empty: PublicConversationHistory = {
    conversationId: null,
    placementKey,
    scopeSlug,
    deploymentGeneration: null,
    messages: [],
  };
  const snapshot = await deps.content.loadCitableSnapshot().catch(() => null);
  if (!snapshot || !placementContentAvailable(placementKey, scopeSlug, snapshot.entries.map((entry) => entry.slug))) {
    return empty;
  }

  const anonHash = hashAnonId(anonId);
  const conversationId = stableAssistantId(anonHash, `${placementKey}\n${scopeSlug}`, 'conversation');
  if (await deps.conversations.isDeleted(conversationId)) return empty;
  const detail = await deps.conversations.detail(conversationId);
  if (!detail || !matchesConversationOwner(detail, anonHash, placementKey, scopeSlug)) return empty;
  const access = await deps.deployments.publicHistoryMembers(placementKey, scopeSlug);
  const messages: PublicConversationHistory['messages'] = [];
  for (const turn of detail.turns) {
    const attempts = new Map(turn.attempts.map((attempt) => [attempt.id, attempt]));
    for (const message of turn.messages) {
      if (message.role === 'visitor') {
        messages.push({
          id: message.id,
          role: 'visitor',
          text: message.body,
          delivery: message.delivery,
          createdAt: message.createdAt,
          member: null,
        });
        continue;
      }
      if (message.delivery === 'pending') continue;
      const attempt = message.attemptId ? attempts.get(message.attemptId) : null;
      const modelAttempt = attempt && attempt.state !== 'fallback';
      const member = modelAttempt ? access.revisions.get(attempt.agentRevisionId) : null;
      if (modelAttempt && !member) {
        messages.push({
          id: message.id,
          role: 'assistant',
          text: '',
          delivery: 'unavailable',
          createdAt: message.createdAt,
          member: null,
          hidden: true,
        });
        continue;
      }
      if (message.delivery === 'unknown') {
        if (attempt?.state !== 'cancelled' || !member) continue;
        messages.push({
          id: message.id,
          role: 'assistant',
          text: message.body,
          delivery: 'partial',
          createdAt: message.createdAt,
          member,
          stopped: true,
        });
        continue;
      }
      messages.push({
        id: message.id,
        role: 'assistant',
        text: message.body,
        delivery: message.delivery,
        createdAt: message.createdAt,
        member: member ?? null,
      });
    }
  }
  return {
    conversationId: detail.id,
    placementKey,
    scopeSlug,
    deploymentGeneration: access.generation,
    messages,
  };
}

/** 停止一条正在生成的访客助手消息，并同步收敛 Attempt 与消息投递状态。 */
export async function stopVisitorMessage(
  deps: {
    conversations: Pick<ConversationRepositoryPort, 'isDeleted' | 'detail' | 'setAssistantMessage' | 'setAttemptState'>;
    execution: { stopPublicRun(runId: string, principalId: string, placementKey: string, scopeSlug: string): Promise<StopResult> };
  },
  anonId: string,
  placementKey: string,
  scopeSlug: string,
  messageId: string,
): Promise<PublicAssistantStopStatus> {
  if (!findPlacement(placementKey)) throw new ApiError('placement-not-found', 404, '找不到这个访客位置');
  if (!SCOPE_SLUG_RE.test(scopeSlug)) throw validationError('assistant-scope-invalid');
  if (!MESSAGE_ID_RE.test(messageId)) throw validationError('assistant-message-id-invalid');
  const anonHash = hashAnonId(anonId);
  const conversationId = stableAssistantId(anonHash, `${placementKey}\n${scopeSlug}`, 'conversation');
  if (await deps.conversations.isDeleted(conversationId)) {
    throw new ApiError('assistant-message-not-found', 404, '找不到这条助手消息');
  }
  const detail = await deps.conversations.detail(conversationId);
  if (!detail || !matchesConversationOwner(detail, anonHash, placementKey, scopeSlug)) {
    throw new ApiError('assistant-message-not-found', 404, '找不到这条助手消息');
  }
  const turn = detail.turns.find((item) => item.messages.some((message) => message.id === messageId && message.role === 'assistant'));
  const message = turn?.messages.find((item) => item.id === messageId && item.role === 'assistant');
  if (!turn || !message) throw new ApiError('assistant-message-not-found', 404, '找不到这条助手消息');
  if (message.delivery === 'sent' || message.delivery === 'ack') return { state: 'SUCCEEDED', confirmed: true };

  const attempt = message.attemptId ? turn.attempts.find((item) => item.id === message.attemptId) : null;
  if (!attempt?.runId) {
    if (attempt?.state === 'cancelled') {
      await deps.conversations.setAssistantMessage({ id: message.id, body: message.body, delivery: 'unknown', attemptId: attempt.id });
      return { state: 'CANCELLED', confirmed: true };
    }
    if (attempt?.state === 'unknown') return { state: 'UNKNOWN', confirmed: false };
    return { state: 'PENDING', confirmed: false };
  }

  const stopped = await deps.execution.stopPublicRun(attempt.runId, anonHash, placementKey, scopeSlug);
  if (stopped.outcome === 'isolated') {
    await deps.conversations.setAttemptState(attempt.id, 'unknown');
    return { state: 'UNKNOWN', confirmed: false };
  }
  const state = stopped.state;
  if (state === 'CANCELLED') {
    await deps.conversations.setAttemptState(attempt.id, 'cancelled');
    await deps.conversations.setAssistantMessage({ id: message.id, body: message.body, delivery: 'unknown', attemptId: attempt.id });
  } else if (state === 'FAILED') {
    await deps.conversations.setAttemptState(attempt.id, 'failed');
  }
  if (state === 'CANCELLED' || state === 'FAILED' || state === 'SUCCEEDED') {
    return { state, confirmed: true };
  }
  return { state: 'PENDING', confirmed: false };
}

/** 校验并记录访客助手互动事件（引用点击、成员切换、反馈等）。 */
export async function recordVisitorInteraction(
  deps: {
    rateLimit: Pick<RateLimitPort, 'consume'>;
    content: Pick<SiteContentIndexPort, 'loadCitableSnapshot'>;
    conversations: Pick<ConversationRepositoryPort, 'isDeleted' | 'detail'>;
    deployments: { publicHistoryMembers(placementKey: string, scopeSlug: string): Promise<PublicDeploymentHistoryAccess> };
    repo: Pick<AssistantRepositoryPort, 'findRunByRequest'>;
    events: Pick<AssistantEventRecorderPort, 'record'>;
    placementManifest: (placementKey: string, scopeSlug: string) => Promise<PublicPlacementManifest>;
    waitOptional: <T>(work: Promise<T>, fallback: T) => Promise<T>;
  },
  anonId: string,
  ipKey: string,
  raw: unknown,
) {
  const input = parseAssistantInteraction(raw);
  if (!input) throw validationError('assistant-event-invalid');
  const anonHash = hashAnonId(anonId);
  if (!deps.rateLimit.consume(`assistant:events:ip:${ipKey}`, RATE_LIMITS.assistantInteractionPerWindow, RATE_LIMITS.windowSeconds) ||
      !deps.rateLimit.consume(`assistant:events:anon:${anonHash}`, RATE_LIMITS.assistantInteractionPerWindow, RATE_LIMITS.windowSeconds)) {
    throw rateLimited();
  }

  const snapshot = await deps.content.loadCitableSnapshot().catch(() => null);
  if (!snapshot || !placementContentAvailable(input.placementKey, input.scopeSlug, snapshot.entries.map((entry) => entry.slug))) {
    throw new ApiError('content-not-citable', 404, '位置当前没有可引用的公开内容');
  }
  if (input.targetSlug && !snapshot.entries.some((entry) => entry.slug === input.targetSlug)) {
    throw validationError('assistant-event-target-invalid');
  }

  let member: { name: string; revision: number } | null = null;
  if (input.memberKey) {
    const manifest = await deps.waitOptional(deps.placementManifest(input.placementKey, input.scopeSlug), null);
    if (!manifest) throw new ApiError('assistant-event-member-invalid', 404, '找不到当前公开成员');
    member = manifest.members.find((candidate) => candidate.key === input.memberKey) ?? null;
    if (!manifest.available || !manifest.aiEnabled || !member) {
      throw new ApiError('assistant-event-member-invalid', 404, '找不到当前公开成员');
    }
  }
  if (input.event === 'member-switch' && !member) {
    throw new ApiError('assistant-event-member-invalid', 404, '找不到当前公开成员');
  }

  const conversationId = stableAssistantId(anonHash, `${input.placementKey}\n${input.scopeSlug}`, 'conversation');
  if (await deps.conversations.isDeleted(conversationId)) {
    throw new ApiError('conversation-deleted', 410, '会话已删除');
  }
  const detail = await deps.waitOptional(deps.conversations.detail(conversationId), null);
  const conversation = detail && matchesConversationOwner(detail, anonHash, input.placementKey, input.scopeSlug)
    ? detail
    : null;
  if (input.messageId) {
    const turn = conversation?.turns.find((candidate) => candidate.messages.some((message) => message.id === input.messageId));
    const message = turn?.messages.find((candidate) => candidate.id === input.messageId && candidate.role === 'assistant');
    const pendingSend = input.event === 'send' || input.event === 'follow-up';
    if (!turn || !message || !(message.delivery === 'sent' || message.delivery === 'ack' || message.delivery === 'partial' || (pendingSend && message.delivery === 'pending'))) {
      throw new ApiError('assistant-message-not-found', 404, '找不到这条助手消息');
    }
    const attempt = message.attemptId ? turn.attempts.find((candidate) => candidate.id === message.attemptId) : null;
    if (attempt && attempt.state !== 'fallback') {
      const access = await deps.deployments.publicHistoryMembers(input.placementKey, input.scopeSlug);
      if (!access.revisions.has(attempt.agentRevisionId)) {
        throw new ApiError('assistant-message-not-found', 404, '找不到这条助手消息');
      }
    }
    if (input.event === 'citation-click') {
      const run = await deps.waitOptional(deps.repo.findRunByRequest(anonHash, turn.requestKey), null);
      if (!run?.aiUsedFlag || !run.citations.includes(input.targetSlug!)) {
        throw new ApiError('assistant-event-target-invalid', 404, '找不到这条已展示的引用');
      }
    }
  }

  const props = {
    placementKey: input.placementKey,
    scopeSlug: input.scopeSlug,
    ...(member ? { member: { name: member.name, revision: member.revision } } : {}),
    ...(input.messageId ? { messageId: input.messageId } : {}),
    ...(input.targetSlug ? { targetSlug: input.targetSlug } : {}),
    ...(input.feedback ? { feedback: input.feedback } : {}),
    ...(input.occurredAt ? { clientOccurredAt: input.occurredAt } : {}),
  };
  const outcome = await deps.events.record({
    id: newId(),
    eventId: input.eventId,
    featureKey: ASSISTANT_INTERACTION_FEATURE_KEY,
    event: input.event,
    actorType: 'visitor',
    failCode: null,
    conversationId: conversation?.id ?? null,
    props,
  });
  return { recorded: outcome.recorded, duplicate: outcome.duplicate };
}

/** 访客提问前置门禁：限流、输入长度校验、软删会话拦截、幂等键与历史 Run 重放检测。 */
export async function preflightVisitorAsk(
  deps: {
    rateLimit: Pick<RateLimitPort, 'consume'>;
    conversations: Pick<ConversationRepositoryPort, 'isDeleted'>;
    repo: Pick<AssistantRepositoryPort, 'findRunByRequest'>;
    safeEvent: (input: {
      featureKey: string;
      event: 'expose' | 'attempt' | 'success' | 'fail';
      actorType: 'guest' | 'user' | 'owner';
      failCode?: string | null;
      conversationId?: string | null;
    }) => void;
    waitOptional: <T>(work: Promise<T>, fallback: T) => Promise<T>;
  },
  input: PublicAssistantAskInput,
): Promise<PublicAssistantGate> {
  const actorType: PublicAssistantGate['actorType'] = 'guest';
  const anonHash = hashAnonId(input.anonId);
  const conversationId = resolveLogicalConversationId(input, anonHash);
  deps.safeEvent({ featureKey: 'assistant.ask', event: 'attempt', actorType, conversationId });
  if (!deps.rateLimit.consume(`assistant:${input.ipKey}`, RATE_LIMITS.guestPerWindow, RATE_LIMITS.windowSeconds) ||
      !deps.rateLimit.consume(`assistant:anon:${anonHash}`, RATE_LIMITS.assistantAnonPerWindow, RATE_LIMITS.windowSeconds)) {
    deps.safeEvent({ featureKey: 'assistant.ask', event: 'fail', actorType, failCode: FEATURE_FAIL_CODES.rateLimited, conversationId });
    throw rateLimited();
  }
  if (!isValidAssistantBody(input.body)) throw validationError('assistant-body-too-short');
  if (conversationId && await deps.conversations.isDeleted(conversationId)) {
    throw new ApiError('conversation-deleted', 410, '会话已删除');
  }

  const requestIdentity = input.requestKey ?? input.requestId ?? randomUUID();
  const requestId = input.requestId ?? requestIdentity;
  const placementKey = input.placementKey?.trim() ?? '';
  const scopeSlug = input.scopeSlug?.trim() ?? '';
  const requestKey = sha256Hex(`${anonHash}\n${requestIdentity}\n${placementKey}\n${scopeSlug}\n${input.memberKey ?? ''}\n${input.deploymentGeneration ?? ''}`);
  const messageId = stableAssistantId(anonHash, requestKey, 'message');
  const attemptId = stableAssistantId(anonHash, requestKey, 'attempt');
  if (input.requestKey !== undefined && input.requestKey !== null && !REQUEST_KEY_RE.test(input.requestKey)) {
    throw validationError('request-key-invalid');
  }
  if (input.requestKey) {
    const prior = await deps.waitOptional(deps.repo.findRunByRequest(anonHash, requestKey), null);
    if (prior) {
      return {
        actorType, anonHash, requestKey, requestId, messageId, attemptId,
        redactedText: prior.question,
        duplicate: {
          sessionId: prior.sessionId, answer: prior.answer,
          citations: prior.citations.map((slug) => ({ slug })), aiUsedFlag: prior.aiUsedFlag,
          elapsedMs: 0, requestId, messageId, attemptId, runId: null, conversationId: null,
        },
      };
    }
  }
  return {
    actorType, anonHash, requestKey, requestId, messageId, attemptId,
    redactedText: redactSensitiveText(input.body.trim()).text, duplicate: null,
  };
}
