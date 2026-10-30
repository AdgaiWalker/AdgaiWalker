import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  FEATURE_FAIL_CODES,
  ASSISTANT_INTERACTION_FEATURE_KEY,
  RATE_LIMITS,
  diagnoseAssistantOutput,
  findPlacement,
  placementContentAvailable,
  isValidAssistantBody,
  redactSensitiveText,
  assistantStreamEventId,
  extractStreamedAnswer,
  ASSISTANT_ANSWER_MIN_LENGTH,
  type AssistantStreamAccepted,
  type AssistantStreamDelta,
  type AssistantStreamDone,
  type AssistantStreamError,
  type AssistantRunResult,
  type DegradeReason,
  parseAssistantInteraction,
  type PublicConversationHistory,
  type PublicAssistantStopStatus,
  type PublicPlacementManifest,
} from '@walker/shared';
import { createHash, randomUUID } from 'node:crypto';
import { newId } from '../common/ids';
import { ApiError, rateLimited, validationError } from '../common/http-error';
import { hashAnonId } from '../auth/anon-cookie';
import { APP_CONFIG, type AppConfigPort } from '../config/config.port';
import { RATE_LIMIT, type RateLimitPort } from '../ports/rate-limit.port';
import { ASSISTANT_REPOSITORY, type AssistantRepositoryPort } from '../ports/assistant.repository';
import { RULE_ASSISTANT, type AssistantRunnerPort } from '../ports/assistant-runner.port';
import { SITE_CONTENT_INDEX, type SiteContentIndexPort } from '../ports/site-content-index.port';
import { CONVERSATION_REPOSITORY, type ConversationRepositoryPort } from '../ports/conversation.repository';
import { ASSISTANT_EVENT_RECORDER, type AssistantEventRecorderPort } from '../ports/assistant-event-recorder.port';
import { AgentExecutionService, type PublicChatExecutionResult } from '../execution/agent-execution.service';
import { DeploymentService } from '../deployments/deployment.service';
import { buildFirstTurnPrompt } from './public-assistant-prompt';
import { JevFastPathService } from './jev-fast-path.service';

export const PUBLIC_ASSISTANT_TIMEOUT_MS = (() => {
  const value = Number(process.env.WALKER_ASSISTANT_ASK_TIMEOUT_MS?.trim());
  return Number.isFinite(value) && value >= 1_000 ? value : 15_000;
})();

const ANSWER_PERSISTENCE_BUDGET_MS = 250;

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
}

export interface PublicAssistantStreamSink {
  accepted(event: AssistantStreamAccepted): void;
  delta(event: AssistantStreamDelta): void;
  done(event: AssistantStreamDone): void;
  error(event: AssistantStreamError): void;
}

type Gate = {
  actorType: 'guest' | 'user';
  anonHash: string;
  requestKey: string;
  requestId: string;
  messageId: string;
  attemptId: string;
  redactedText: string;
  duplicate: PublicAssistantAskResult | null;
};

type ConversationContext = {
  id: string;
  turnId: string;
  attemptId: string | null;
};

type AnswerDelivery = {
  state: { conversation: ConversationContext | null; runId: string | null; streamedText: string };
  emitDelta: (delta: string) => void;
  emitDone: (result: PublicAssistantAskResult) => void;
  emitError: (reason: 'client-abort' | 'user-stopped') => void;
  waitWrites: () => Promise<void>;
};

type PublicDeployment = NonNullable<Awaited<ReturnType<DeploymentService['resolvePublicMember']>>>;
type CompletedPublicChat = Extract<PublicChatExecutionResult, { outcome: 'completed' }>;
type CitableSnapshot = Awaited<ReturnType<SiteContentIndexPort['loadCitableSnapshot']>>;

type ConversationIdentity = { id: string; anonId: string; placementKey: string; scopeSlug: string };

function todayCN(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function stableId(anonHash: string, requestKey: string, kind: string): string {
  return `${kind}-${createHash('sha256').update(`${anonHash}\n${requestKey}\n${kind}`).digest('hex').slice(0, 24)}`;
}

@Injectable()
export class PublicAssistantService {
  private readonly dailyLimit: number;
  private readonly jevFastPath: JevFastPathService;
  private readonly inFlight = new Map<string, Promise<PublicAssistantAskResult>>();
  private fallbackDate = '';
  private fallbackCount = 0;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigPort,
    @Inject(AgentExecutionService) private readonly execution: AgentExecutionService,
    @Inject(DeploymentService) private readonly deployments: DeploymentService,
    @Inject(RULE_ASSISTANT) private readonly fallback: AssistantRunnerPort,
    @Inject(ASSISTANT_REPOSITORY) private readonly repo: AssistantRepositoryPort,
    @Inject(RATE_LIMIT) private readonly rateLimit: RateLimitPort,
    @Inject(ASSISTANT_EVENT_RECORDER) private readonly events: AssistantEventRecorderPort,
    @Inject(SITE_CONTENT_INDEX) private readonly content: SiteContentIndexPort,
    @Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepositoryPort,
    @Optional() @Inject(JevFastPathService) jevFastPath?: JevFastPathService,
  ) {
    this.jevFastPath = jevFastPath ?? new JevFastPathService();
    const configured = Number(process.env.ASSISTANT_DAILY_LIMIT);
    this.dailyLimit = Number.isFinite(configured) && configured > 0 ? configured : 200;
  }

  ask(input: PublicAssistantAskInput): Promise<PublicAssistantAskResult> {
    return this.once(input, () => this.run(input));
  }

  async placementManifest(placementKey: string, scopeSlug: string): Promise<PublicPlacementManifest> {
    const manifest = await this.deployments.publicManifest(placementKey, scopeSlug);
    return { ...manifest, aiEnabled: this.config.isAiEnabled() };
  }

  async conversationHistory(anonId: string, placementKey: string, scopeSlug: string): Promise<PublicConversationHistory> {
    if (!findPlacement(placementKey)) throw new ApiError('placement-not-found', 404, '找不到这个访客位置');
    if (!/^[a-zA-Z0-9_/-]{1,200}$/.test(scopeSlug)) throw validationError('assistant-scope-invalid');
    const empty: PublicConversationHistory = {
      conversationId: null,
      placementKey,
      scopeSlug,
      deploymentGeneration: null,
      messages: [],
    };
    const snapshot = await this.content.loadCitableSnapshot().catch(() => null);
    if (!snapshot || !placementContentAvailable(placementKey, scopeSlug, snapshot.entries.map((entry) => entry.slug))) return empty;

    const anonHash = hashAnonId(anonId);
    const conversationId = stableId(anonHash, `${placementKey}\n${scopeSlug}`, 'conversation');
    if (await this.conversations.isDeleted(conversationId)) return empty;
    const detail = await this.conversations.detail(conversationId);
    if (!detail || detail.anonId !== anonHash || detail.placementKey !== placementKey || detail.scopeSlug !== scopeSlug) return empty;
    const access = await this.deployments.publicHistoryMembers(placementKey, scopeSlug);
    const messages: PublicConversationHistory['messages'] = [];
    for (const turn of detail.turns) {
      const attempts = new Map(turn.attempts.map((attempt) => [attempt.id, attempt]));
      for (const message of turn.messages) {
        if (message.role === 'visitor') {
          messages.push({
            id: message.id, role: 'visitor', text: message.body, delivery: message.delivery,
            createdAt: message.createdAt, member: null,
          });
          continue;
        }
        if (message.delivery === 'pending') continue;
        const attempt = message.attemptId ? attempts.get(message.attemptId) : null;
        const modelAttempt = attempt && attempt.state !== 'fallback';
        const member = modelAttempt ? access.revisions.get(attempt.agentRevisionId) : null;
        if (modelAttempt && !member) {
          messages.push({
            id: message.id, role: 'assistant', text: '', delivery: 'unavailable',
            createdAt: message.createdAt, member: null, hidden: true,
          });
          continue;
        }
        if (message.delivery === 'unknown') {
          if (attempt?.state !== 'cancelled' || !member) continue;
          messages.push({
            id: message.id, role: 'assistant', text: message.body, delivery: 'partial',
            createdAt: message.createdAt, member, stopped: true,
          });
          continue;
        }
        messages.push({
          id: message.id, role: 'assistant', text: message.body, delivery: message.delivery,
          createdAt: message.createdAt, member: member ?? null,
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

  async stopMessage(
    anonId: string,
    placementKey: string,
    scopeSlug: string,
    messageId: string,
  ): Promise<PublicAssistantStopStatus> {
    if (!findPlacement(placementKey)) throw new ApiError('placement-not-found', 404, '找不到这个访客位置');
    if (!/^[a-zA-Z0-9_/-]{1,200}$/.test(scopeSlug)) throw validationError('assistant-scope-invalid');
    if (!/^message-[a-f0-9]{24}$/.test(messageId)) throw validationError('assistant-message-id-invalid');
    const anonHash = hashAnonId(anonId);
    const conversationId = stableId(anonHash, `${placementKey}\n${scopeSlug}`, 'conversation');
    if (await this.conversations.isDeleted(conversationId)) {
      throw new ApiError('assistant-message-not-found', 404, '找不到这条助手消息');
    }
    const detail = await this.conversations.detail(conversationId);
    if (!detail || detail.anonId !== anonHash || detail.placementKey !== placementKey || detail.scopeSlug !== scopeSlug) {
      throw new ApiError('assistant-message-not-found', 404, '找不到这条助手消息');
    }
    const turn = detail.turns.find((item) => item.messages.some((message) => message.id === messageId && message.role === 'assistant'));
    const message = turn?.messages.find((item) => item.id === messageId && item.role === 'assistant');
    if (!turn || !message) throw new ApiError('assistant-message-not-found', 404, '找不到这条助手消息');
    if (message.delivery === 'sent' || message.delivery === 'ack') return { state: 'SUCCEEDED', confirmed: true };

    const attempt = message.attemptId ? turn.attempts.find((item) => item.id === message.attemptId) : null;
    if (!attempt?.runId) {
      if (attempt?.state === 'cancelled') {
        await this.conversations.setAssistantMessage({ id: message.id, body: message.body, delivery: 'unknown', attemptId: attempt.id });
        return { state: 'CANCELLED', confirmed: true };
      }
      if (attempt?.state === 'unknown') return { state: 'UNKNOWN', confirmed: false };
      return { state: 'PENDING', confirmed: false };
    }

    const stopped = await this.execution.stopPublicRun(attempt.runId, anonHash, placementKey, scopeSlug);
    if (stopped.outcome === 'isolated') {
      await this.conversations.setAttemptState(attempt.id, 'unknown');
      return { state: 'UNKNOWN', confirmed: false };
    }
    const state = stopped.state;
    if (state === 'CANCELLED') {
      await this.conversations.setAttemptState(attempt.id, 'cancelled');
      await this.conversations.setAssistantMessage({ id: message.id, body: message.body, delivery: 'unknown', attemptId: attempt.id });
    }
    else if (state === 'FAILED') await this.conversations.setAttemptState(attempt.id, 'failed');
    const confirmed = state === 'CANCELLED' || state === 'FAILED' || state === 'SUCCEEDED';
    if (state === 'CANCELLED' || state === 'FAILED' || state === 'SUCCEEDED') {
      return { state, confirmed: true };
    }
    return { state: 'PENDING', confirmed };
  }

  async recordInteraction(anonId: string, ipKey: string, raw: unknown) {
    const input = parseAssistantInteraction(raw);
    if (!input) throw validationError('assistant-event-invalid');
    const anonHash = hashAnonId(anonId);
    if (!this.rateLimit.consume(`assistant:events:ip:${ipKey}`, RATE_LIMITS.assistantInteractionPerWindow, RATE_LIMITS.windowSeconds) ||
        !this.rateLimit.consume(`assistant:events:anon:${anonHash}`, RATE_LIMITS.assistantInteractionPerWindow, RATE_LIMITS.windowSeconds)) {
      throw rateLimited();
    }

    const snapshot = await this.content.loadCitableSnapshot().catch(() => null);
    if (!snapshot || !placementContentAvailable(input.placementKey, input.scopeSlug, snapshot.entries.map((entry) => entry.slug))) {
      throw new ApiError('content-not-citable', 404, '位置当前没有可引用的公开内容');
    }
    if (input.targetSlug && !snapshot.entries.some((entry) => entry.slug === input.targetSlug)) {
      throw validationError('assistant-event-target-invalid');
    }

    let member: { name: string; revision: number } | null = null;
    if (input.memberKey) {
      const manifest = await this.waitForOptionalValue(this.placementManifest(input.placementKey, input.scopeSlug), null);
      if (!manifest) throw new ApiError('assistant-event-member-invalid', 404, '找不到当前公开成员');
      member = manifest.members.find((candidate) => candidate.key === input.memberKey) ?? null;
      if (!manifest.available || !manifest.aiEnabled || !member) {
        throw new ApiError('assistant-event-member-invalid', 404, '找不到当前公开成员');
      }
    }
    if (input.event === 'member-switch' && !member) {
      throw new ApiError('assistant-event-member-invalid', 404, '找不到当前公开成员');
    }

    const conversationId = stableId(anonHash, `${input.placementKey}\n${input.scopeSlug}`, 'conversation');
    if (await this.conversations.isDeleted(conversationId)) {
      throw new ApiError('conversation-deleted', 410, '会话已删除');
    }
    const detail = await this.waitForOptionalValue(this.conversations.detail(conversationId), null);
    const conversation = detail && detail.anonId === anonHash && detail.placementKey === input.placementKey && detail.scopeSlug === input.scopeSlug
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
        const access = await this.deployments.publicHistoryMembers(input.placementKey, input.scopeSlug);
        if (!access.revisions.has(attempt.agentRevisionId)) {
          throw new ApiError('assistant-message-not-found', 404, '找不到这条助手消息');
        }
      }
      if (input.event === 'citation-click') {
        const run = await this.waitForOptionalValue(this.repo.findRunByRequest(anonHash, turn.requestKey), null);
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
    const outcome = await this.events.record({
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

  askStream(
    input: PublicAssistantAskInput,
    sink: PublicAssistantStreamSink,
  ): Promise<PublicAssistantAskResult> {
    return this.once(input, () => this.run(input, sink), sink);
  }

  private once(
    input: PublicAssistantAskInput,
    run: () => Promise<PublicAssistantAskResult>,
    stream?: PublicAssistantStreamSink,
  ): Promise<PublicAssistantAskResult> {
    if (!input.requestKey) return run();
    const key = `${hashAnonId(input.anonId)}\n${input.requestKey}\n${input.placementKey ?? ''}\n${input.scopeSlug ?? ''}\n${input.memberKey ?? ''}\n${input.deploymentGeneration ?? ''}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing.then((result) => {
      this.replayStream(result, stream);
      return result;
    });
    const pending = Promise.resolve().then(run).finally(() => { this.inFlight.delete(key); });
    this.inFlight.set(key, pending);
    return pending;
  }

  private emitAccepted(gate: Gate, stream?: PublicAssistantStreamSink): void {
    if (!stream) return;
    try {
      stream.accepted({
        version: 2, type: 'accepted', eventId: assistantStreamEventId(gate.messageId, 0),
        requestId: gate.requestId, messageId: gate.messageId, attemptId: gate.attemptId,
        runId: null, sequence: 0,
      });
    } catch { /* 写入失败时交付状态由 V11.b 收敛 */ }
  }

  private replayStream(result: PublicAssistantAskResult, stream?: PublicAssistantStreamSink): void {
    if (!stream) return;
    const frames = this.completedFrames(result, result.runId);
    try {
      stream.accepted(frames.accepted);
      stream.delta(frames.delta);
      stream.done(frames.done);
    } catch { /* 写入失败时交付状态由 V11.b 收敛 */ }
  }

  private completedFrames(result: PublicAssistantAskResult, acceptedRunId: string | null): {
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
        version: 2, type: 'accepted', eventId: assistantStreamEventId(result.messageId, 0),
        ...identity, runId: acceptedRunId, sequence: 0,
      },
      delta: {
        version: 2, type: 'delta', eventId: assistantStreamEventId(result.messageId, 1),
        ...identity, runId: result.runId, sequence: 1, delta: result.answer,
      },
      done: {
        version: 2, type: 'done', eventId: assistantStreamEventId(result.messageId, 2),
        ...identity, runId: result.runId, sequence: 2, result,
      },
    };
  }

  private async replayDuplicate(options: {
    input: PublicAssistantAskInput;
    gate: Gate;
    prior: PublicAssistantAskResult;
    modelAvailable: boolean;
    stream?: PublicAssistantStreamSink;
  }): Promise<PublicAssistantAskResult> {
    const { input, gate, prior, modelAvailable, stream } = options;
    const isFastPath = prior.sessionId?.startsWith('jev-fast-path-');
    if (prior.aiUsedFlag && !modelAvailable && !isFastPath) {
      throw new ApiError('placement-generation-conflict', 409, '公开成员列表已更新，请刷新后重试');
    }
    const conversation = await this.ensureConversation(input, gate);
    const result = { ...prior, conversationId: conversation?.id ?? null };
    const frames = this.completedFrames(result, null);
    if (stream) {
      try { stream.accepted(frames.accepted); } catch { /* 接收端已断开 */ }
    }
    if (conversation) {
      await this.conversations.setAssistantMessage({
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

  private createDelivery(
    gate: Gate,
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
            version: 2, type: 'delta', eventId: assistantStreamEventId(gate.messageId, sequence),
            requestId: gate.requestId, messageId: gate.messageId, attemptId: gate.attemptId,
            runId: state.runId, sequence, delta,
          });
        } catch { /* 写入失败时交付状态由 V11.b 收敛 */ }
        if (state.conversation) {
          const body = state.streamedText;
          messageWrites = messageWrites.then(() => this.conversations.setAssistantMessage({
            id: gate.messageId,
            body,
            delivery: 'partial',
            ...(state.conversation?.attemptId ? { attemptId: state.conversation.attemptId } : {}),
          })).catch(() => {});
        }
      },
      emitDone: (result) => {
        if (!stream) return;
        sequence += 1;
        try {
          stream.done({
            version: 2, type: 'done', eventId: assistantStreamEventId(gate.messageId, sequence),
            requestId: gate.requestId, messageId: gate.messageId, attemptId: gate.attemptId,
            runId: result.runId, sequence, result,
          });
        } catch { /* 写入失败时交付状态由 V11.b 收敛 */ }
      },
      emitError: (reason) => {
        if (!stream) return;
        sequence += 1;
        try {
          stream.error({
            version: 2, type: 'error', eventId: assistantStreamEventId(gate.messageId, sequence),
            requestId: gate.requestId, messageId: gate.messageId, attemptId: gate.attemptId,
            runId: state.runId, sequence,
            code: reason === 'user-stopped' ? 'user-stopped' : 'client-abort',
            message: reason === 'user-stopped' ? '回答已停止。' : '连接已断开，本次回答未确认送达。',
          });
        } catch { /* 已断开连接 */ }
      },
      waitWrites: () => messageWrites,
    };
  }

  private async fallbackAnswer(options: {
    input: PublicAssistantAskInput;
    gate: Gate;
    delivery: AnswerDelivery;
    reason: DegradeReason;
  }): Promise<PublicAssistantAskResult> {
    const { input, gate, delivery, reason } = options;
    const result = await this.rule({
      sessionId: null,
      text: gate.redactedText,
      visitorKey: gate.anonHash,
      ...(input.signal ? { signal: input.signal } : {}),
    }, reason);
    delivery.emitDelta(result.answer);
    await this.waitForAnswerPersistence(delivery.waitWrites());
    const finished = await this.finish({ input, gate, result, runId: null, conversation: delivery.state.conversation });
    delivery.emitDone(finished);
    return finished;
  }

  private async stoppedAnswer(options: {
    gate: Gate;
    delivery: AnswerDelivery;
    reason: 'client-abort' | 'user-stopped';
    sessionId: string | null;
    startedAt: number;
  }): Promise<PublicAssistantAskResult> {
    const { gate, delivery, reason, sessionId, startedAt } = options;
    await delivery.waitWrites();
    if (delivery.state.conversation) {
      const deliveryStatus = delivery.state.streamedText ? 'partial' : 'unknown';
      await this.conversations.setAssistantMessage({
        id: gate.messageId,
        body: delivery.state.streamedText,
        delivery: deliveryStatus,
        ...(delivery.state.conversation.attemptId ? { attemptId: delivery.state.conversation.attemptId } : {}),
      }).catch(() => {});
      if (delivery.state.conversation.attemptId) await this.conversations.setAttemptState(delivery.state.conversation.attemptId, 'cancelled').catch(() => {});
    }
    delivery.emitError(reason);
    return {
      sessionId: sessionId ?? '', answer: delivery.state.streamedText, citations: [], aiUsedFlag: delivery.state.streamedText.length > 0,
      elapsedMs: Date.now() - startedAt, requestId: gate.requestId, messageId: gate.messageId,
      attemptId: gate.attemptId, runId: delivery.state.runId, conversationId: delivery.state.conversation?.id ?? null,
    };
  }

  private async completeModelAnswer(options: {
    input: PublicAssistantAskInput;
    gate: Gate;
    delivery: AnswerDelivery;
    deployment: PublicDeployment;
    execution: CompletedPublicChat;
    citableSlugs: ReadonlySet<string>;
    startedAt: number;
  }): Promise<PublicAssistantAskResult> {
    const { input, gate, delivery, deployment, execution, citableSlugs, startedAt } = options;
    const diagnosis = diagnoseAssistantOutput(execution.output, citableSlugs);
    // 没跑完说明输出不是完整 JSON，但**已经生成的正文是真的**，而且访客在流式期间已经看到了。
    // 这时候换成「AI 未启用」的规则文案，等于把已经提供的服务说成没提供——交付已生成的部分。
    const partialAnswer = !diagnosis.ok && execution.partial
      ? extractStreamedAnswer(execution.output).trim()
      : '';
    if (!diagnosis.ok && partialAnswer.length < ASSISTANT_ANSWER_MIN_LENGTH) {
      return this.fallbackAnswer({ input, gate, delivery, reason: 'bad-output' });
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
      // 只有「没跑完」这一种情况带 partial：完整回答不该被标成未写完
      ...(diagnosis.ok ? {} : { partial: true }),
    };
    if (delivery.state.conversation && execution.sessionId) {
      await this.waitForAnswerPersistence(this.conversations.linkSdkSession({
        id: stableId(delivery.state.conversation.id, deployment.agentRevisionId, 'conversation-sdk'),
        conversationId: delivery.state.conversation.id,
        agentRevisionId: deployment.agentRevisionId,
        sdkSessionId: execution.sessionId,
      }).catch(() => {}));
    }
    await this.waitForAnswerPersistence(delivery.waitWrites());
    if (delivery.state.conversation?.attemptId) {
      await this.waitForAnswerPersistence(this.conversations.setAttemptState(delivery.state.conversation.attemptId, 'generated').catch(() => {}));
    }
    const finished = await this.finish({
      input, gate, result, agentRevisionId: deployment.agentRevisionId,
      runId: execution.runId, conversation: delivery.state.conversation,
    });
    delivery.emitDone(finished);
    return finished;
  }

  private executePublicModel(options: {
    input: PublicAssistantAskInput;
    gate: Gate;
    delivery: AnswerDelivery;
    deployment: PublicDeployment;
    snapshot: CitableSnapshot;
    placementKey: string;
    scopeSlug: string;
    prompt: string;
    sessionId: string | null;
    startedAt: number;
  }): Promise<PublicChatExecutionResult> {
    const { input, gate, delivery, deployment, snapshot, placementKey, scopeSlug, prompt, sessionId, startedAt } = options;
    return this.execution.runPublicChat({
      principalId: gate.anonHash,
      runtimeVisitorKey: input.anonId,
      conversationId: delivery.state.conversation?.id ?? this.logicalConversationId(input, gate.anonHash),
      agentId: deployment.agentId,
      agentRevisionId: deployment.agentRevisionId,
      requestKey: gate.requestKey,
      targetSlug: scopeSlug,
      prompt,
      freshPrompt: buildFirstTurnPrompt(snapshot.entries, gate.redactedText, null),
      placementKey,
      deploymentId: deployment.deploymentId,
      deploymentGeneration: deployment.generation,
      contentSnapshotId: snapshot.collectionHash,
      runtimeSessionId: sessionId,
      deadlineAt: new Date(startedAt + PUBLIC_ASSISTANT_TIMEOUT_MS),
      signal: input.signal,
      onQueued: async (queuedRunId) => {
        delivery.state.runId = queuedRunId;
        if (delivery.state.conversation?.attemptId) await this.conversations.setAttemptRunId(delivery.state.conversation.attemptId, queuedRunId).catch(() => {});
      },
      onText: delivery.emitDelta,
    });
  }

  private async ensureConversation(input: PublicAssistantAskInput, gate: Gate): Promise<ConversationContext | null> {
    const placementKey = input.placementKey?.trim() ?? '';
    const scopeSlug = input.scopeSlug?.trim() ?? '';
    if (!findPlacement(placementKey) || !/^[a-zA-Z0-9_/-]{1,200}$/.test(scopeSlug)) return null;

    try {
      let conversation: ConversationIdentity | null = input.conversationId
        ? await this.conversations.detail(input.conversationId).catch(() => null)
        : null;
      if (conversation && (conversation.anonId !== gate.anonHash || conversation.placementKey !== placementKey || conversation.scopeSlug !== scopeSlug)) {
        conversation = null;
      }
      if (!conversation) {
        const id = stableId(gate.anonHash, `${placementKey}\n${scopeSlug}`, 'conversation');
        conversation = await this.conversations.detail(id);
        if (!conversation) {
          try {
            conversation = await this.conversations.create({ id, anonId: gate.anonHash, placementKey, scopeSlug });
          } catch {
            conversation = await this.conversations.detail(id);
          }
        }
      }
      if (!conversation || conversation.anonId !== gate.anonHash || conversation.placementKey !== placementKey || conversation.scopeSlug !== scopeSlug) return null;

      const turnKey = `${conversation.id}\n${gate.requestKey}`;
      const turn = await this.conversations.addVisitorMessage({
        conversationId: conversation.id,
        turnId: stableId(gate.anonHash, turnKey, 'turn'),
        messageId: stableId(gate.anonHash, turnKey, 'visitor'),
        requestKey: gate.requestKey,
        body: gate.redactedText,
      });
      if (!turn.messages.some((message) => message.id === gate.messageId)) {
        await this.conversations.addAssistantMessage({ id: gate.messageId, turnId: turn.id, attemptId: null, body: '' });
      }
      return { id: conversation.id, turnId: turn.id, attemptId: null };
    } catch {
      return null;
    }
  }

  private async attachAttempt(
    conversation: ConversationContext | null,
    gate: Gate,
    agentRevisionId: string,
  ): Promise<ConversationContext | null> {
    if (!conversation) return null;
    try {
      await this.conversations.addAttempt({ id: gate.attemptId, turnId: conversation.turnId, agentRevisionId, runId: null });
      await this.conversations.setAssistantMessage({ id: gate.messageId, body: '', delivery: 'pending', attemptId: gate.attemptId });
      return { ...conversation, attemptId: gate.attemptId };
    } catch {
      return conversation;
    }
  }

  private async run(
    input: PublicAssistantAskInput,
    stream?: PublicAssistantStreamSink,
  ): Promise<PublicAssistantAskResult> {
    const gate = await this.preflight(input);
    const logicalConversationId = this.logicalConversationId(input, gate.anonHash);
    if (logicalConversationId && await this.conversations.isDeleted(logicalConversationId)) {
      throw new ApiError('conversation-deleted', 410, '会话已删除');
    }
    const aiEnabled = this.config.isAiEnabled();
    const placementKey = input.placementKey?.trim() ?? '';
    const scopeSlug = input.scopeSlug?.trim() ?? '';
    let deployment = null;
    if (aiEnabled && placementKey && scopeSlug) {
      try {
        deployment = await this.waitForOrTimeout(this.deployments.resolvePublicMember(
          placementKey,
          scopeSlug,
          input.memberKey ?? null,
          input.deploymentGeneration ?? null,
        ), null);
      } catch (error) {
        const candidate = error instanceof ApiError ? (error.getResponse() as Record<string, unknown>)?.code : '';
        if (error instanceof ApiError && candidate !== 'public-readiness-blocked') throw error;
        void this.safeEvent({ featureKey: 'assistant.ask', event: 'fail', actorType: 'guest', failCode: 'deployment-storage-failed', conversationId: logicalConversationId });
      }
    }
    if (gate.duplicate) {
      return this.replayDuplicate({
        input, gate, prior: gate.duplicate, modelAvailable: aiEnabled && Boolean(deployment), stream,
      });
    }
    const conversation = await this.waitForOptionalValue(this.ensureConversation(input, gate), null);
    this.emitAccepted(gate, stream);
    const delivery = this.createDelivery(gate, stream, conversation);
    const fallbackResult = (reason: DegradeReason) => this.fallbackAnswer({ input, gate, delivery, reason });

    // JEV System One 毫秒级意图前置分流门控 (Fast-Path Intent Gating)
    if (this.jevFastPath.isEnabled()) {
      const fastPath = await this.jevFastPath.check(gate.redactedText);
      if (fastPath) {
        delivery.emitDelta(fastPath.result.answer);
        await this.waitForAnswerPersistence(delivery.waitWrites());
        const finished = await this.finish({
          input,
          gate,
          result: fastPath.result,
          runId: null,
          conversation: delivery.state.conversation,
        });
        delivery.emitDone(finished);
        return finished;
      }
    }

    if (!aiEnabled) {
      return fallbackResult('ai-disabled');
    }

    if (!placementKey || !scopeSlug) {
      return fallbackResult('deployment-disabled');
    }

    if (!deployment) {
      return fallbackResult('deployment-disabled');
    }
    let snapshot;
    try {
      snapshot = await this.content.loadCitableSnapshot();
    } catch {
      return fallbackResult('snapshot-unavailable');
    }
    const citableSlugs = new Set(snapshot.entries.map((item) => item.slug));
    if (!placementContentAvailable(placementKey, scopeSlug, [...citableSlugs])) {
      return fallbackResult('content-not-citable');
    }
    delivery.state.conversation = await this.attachAttempt(delivery.state.conversation, gate, deployment.agentRevisionId);

    const budget = await this.useBudget(gate.actorType, delivery.state.conversation?.id ?? logicalConversationId);
    if (budget.reason) {
      return fallbackResult(budget.reason);
    }

    const sessionId = delivery.state.conversation
      ? await this.conversations.sdkSessionFor(delivery.state.conversation.id, deployment.agentRevisionId).catch(() => null)
      : await this.ownedRuntimeSession(input, gate.anonHash, deployment.agentRevisionId);
    const prompt = sessionId
      ? gate.redactedText
      : buildFirstTurnPrompt(snapshot.entries, gate.redactedText, null);
    const startedAt = Date.now();
    let execution: PublicChatExecutionResult;
    try {
      execution = await this.executePublicModel({
        input, gate, delivery, deployment, snapshot, placementKey, scopeSlug, prompt, sessionId, startedAt,
      });
    } catch {
      return fallbackResult('runtime-error');
    }

    if (execution.outcome === 'degraded') {
      if (execution.reason === 'client-abort' || execution.reason === 'user-stopped') {
        return this.stoppedAnswer({ gate, delivery, reason: execution.reason, sessionId, startedAt });
      }
      return fallbackResult(execution.reason);
    }

    return this.completeModelAnswer({ input, gate, delivery, deployment, execution, citableSlugs, startedAt });
  }

  private async preflight(input: PublicAssistantAskInput): Promise<Gate> {
    const actorType: Gate['actorType'] = 'guest';
    const anonHash = hashAnonId(input.anonId);
    const conversationId = this.logicalConversationId(input, anonHash);
    void this.safeEvent({ featureKey: 'assistant.ask', event: 'attempt', actorType, conversationId });
    if (!this.rateLimit.consume(`assistant:${input.ipKey}`, RATE_LIMITS.guestPerWindow, RATE_LIMITS.windowSeconds) ||
        !this.rateLimit.consume(`assistant:anon:${anonHash}`, RATE_LIMITS.assistantAnonPerWindow, RATE_LIMITS.windowSeconds)) {
      void this.safeEvent({ featureKey: 'assistant.ask', event: 'fail', actorType, failCode: FEATURE_FAIL_CODES.rateLimited, conversationId });
      throw rateLimited();
    }
    if (!isValidAssistantBody(input.body)) throw validationError('assistant-body-too-short');
    if (conversationId && await this.conversations.isDeleted(conversationId)) {
      throw new ApiError('conversation-deleted', 410, '会话已删除');
    }

    const requestIdentity = input.requestKey ?? input.requestId ?? randomUUID();
    const requestId = input.requestId ?? requestIdentity;
    const placementKey = input.placementKey?.trim() ?? '';
    const scopeSlug = input.scopeSlug?.trim() ?? '';
    const requestKey = createHash('sha256')
      .update(`${anonHash}\n${requestIdentity}\n${placementKey}\n${scopeSlug}\n${input.memberKey ?? ''}\n${input.deploymentGeneration ?? ''}`)
      .digest('hex');
    const messageId = stableId(anonHash, requestKey, 'message');
    const attemptId = stableId(anonHash, requestKey, 'attempt');
    if (input.requestKey !== undefined && input.requestKey !== null && !/^[a-zA-Z0-9_-]{8,128}$/.test(input.requestKey)) {
      throw validationError('request-key-invalid');
    }
    if (input.requestKey) {
      const prior = await this.waitForOptionalValue(this.repo.findRunByRequest(anonHash, requestKey), null);
      if (prior) {
        return {
          actorType,
          anonHash,
          requestKey,
          requestId,
          messageId,
          attemptId,
          redactedText: prior.question,
          duplicate: {
            sessionId: prior.sessionId,
            answer: prior.answer,
            citations: prior.citations.map((slug) => ({ slug })),
            aiUsedFlag: prior.aiUsedFlag,
            elapsedMs: 0,
            requestId,
            messageId,
            attemptId,
            runId: null,
            conversationId: null,
          },
        };
      }
    }
    const redactedText = redactSensitiveText(input.body.trim()).text;
    return { actorType, anonHash, requestKey, requestId, messageId, attemptId, redactedText, duplicate: null };
  }

  private async ownedRuntimeSession(
    input: PublicAssistantAskInput,
    anonHash: string,
    agentRevisionId: string,
  ): Promise<string | null> {
    if (!input.sessionId) return null;
    try {
      const owner = await this.waitForOptionalValue(this.repo.findSession(input.sessionId), null);
      return owner?.anonId === anonHash && owner.runner === 'harness' && owner.agentRevisionId === agentRevisionId
        ? input.sessionId
        : null;
    } catch {
      return null;
    }
  }

  private async useBudget(actorType: Gate['actorType'], conversationId: string | null): Promise<{ reason: DegradeReason | null }> {
    const dateKey = todayCN();
    const storedUsed = await this.waitForOptionalValue(this.repo.bumpRequests(dateKey), null);
    let used = storedUsed ?? 0;
    if (storedUsed === null) {
      if (this.fallbackDate !== dateKey) {
        this.fallbackDate = dateKey;
        this.fallbackCount = 0;
      }
      this.fallbackCount += 1;
      used = this.fallbackCount;
      void this.safeEvent({ featureKey: 'assistant.ask', event: 'fail', actorType, failCode: 'budget-storage-failed', conversationId });
    }
    if (used > this.dailyLimit) {
      void this.safeEvent({ featureKey: 'assistant.ask', event: 'fail', actorType, failCode: 'budget-exceeded', conversationId });
      return { reason: 'budget-exceeded' };
    }
    return { reason: null };
  }

  private async rule(
    input: { sessionId: string | null; text: string; visitorKey: string; signal?: AbortSignal },
    degradeReason: DegradeReason,
  ): Promise<AssistantRunResult> {
    return { ...(await this.fallback.ask(input)), degradeReason };
  }

  private async finish(options: {
    input: PublicAssistantAskInput;
    gate: Gate;
    result: AssistantRunResult;
    agentRevisionId?: string;
    runId: string | null;
    conversation: ConversationContext | null;
  }): Promise<PublicAssistantAskResult> {
    const { input, gate, result, agentRevisionId, runId, conversation } = options;
    await this.waitForAnswerPersistence((async () => {
      if (conversation) {
        await this.conversations.setAssistantMessage({
          id: gate.messageId,
          body: result.answer,
          delivery: 'pending',
          ...(conversation.attemptId ? { attemptId: conversation.attemptId } : {}),
        });
        if (conversation.attemptId) {
          await this.conversations.setAttemptState(conversation.attemptId, result.aiUsedFlag ? 'generated' : 'fallback');
        }
      }
      await this.repo.upsertSession({
        id: newId(),
        anonId: gate.anonHash,
        sessionId: result.sessionId,
        runner: result.aiUsedFlag ? 'harness' : 'rule',
        agentRevisionId: result.aiUsedFlag ? agentRevisionId ?? null : null,
        conversationId: conversation?.id ?? this.logicalConversationId(input, gate.anonHash),
      });
      await this.repo.saveRun({
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
        conversationId: conversation?.id ?? this.logicalConversationId(input, gate.anonHash),
      });
      if (result.usage) await this.repo.addTokens(todayCN(), {
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
      });
    })());
    void this.safeEvent({
      featureKey: 'assistant.ask',
      event: 'success',
      actorType: gate.actorType,
      conversationId: conversation?.id ?? this.logicalConversationId(input, gate.anonHash),
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
    };
  }

  async markSent(anonId: string, messageId: string): Promise<boolean> {
    try { return await this.conversations.setAssistantDeliveryForVisitor(messageId, hashAnonId(anonId), 'sent'); }
    catch { return false; }
  }

  async markUnknown(anonId: string, messageId: string): Promise<boolean> {
    try { return await this.conversations.setAssistantDeliveryForVisitor(messageId, hashAnonId(anonId), 'unknown'); }
    catch { return false; }
  }

  async acknowledgeMessage(anonId: string, messageId: string) {
    if (!/^message-[a-f0-9]{24}$/.test(messageId)) throw validationError('message-id-invalid');
    const outcome = await this.conversations.acknowledgeMessage(messageId, hashAnonId(anonId));
    if (outcome === 'not-found') throw new ApiError('assistant-message-not-found', 404, '找不到这条消息');
    if (outcome === 'not-sent') throw new ApiError('assistant-message-not-sent', 409, '消息尚未发送');
    return { acknowledged: true, duplicate: outcome === 'duplicate' };
  }

  private safeEvent(input: {
    featureKey: string;
    event: 'expose' | 'attempt' | 'success' | 'fail';
    actorType: 'guest' | 'user' | 'owner';
    failCode?: string | null;
    props?: Record<string, unknown> | null;
    conversationId?: string | null;
  }) {
    const id = newId();
    return this.events.record({
      id,
      eventId: id,
      ...input,
      conversationId: input.conversationId ?? null,
    }).then(() => {}).catch(() => {});
  }

  private logicalConversationId(input: PublicAssistantAskInput, anonHash: string): string | null {
    const placementKey = input.placementKey?.trim() ?? '';
    const scopeSlug = input.scopeSlug?.trim() ?? '';
    if (!findPlacement(placementKey) || !/^[a-zA-Z0-9_/-]{1,200}$/.test(scopeSlug)) return null;
    return stableId(anonHash, `${placementKey}\n${scopeSlug}`, 'conversation');
  }

  private async waitForAnswerPersistence(work: Promise<unknown>): Promise<void> {
    await this.waitForOptionalValue(work, undefined);
  }

  private async waitForOptionalValue<T>(work: Promise<T>, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ANSWER_PERSISTENCE_BUDGET_MS);
      timer.unref?.();
    });
    const result = await Promise.race([work.catch(() => fallback), timeout]);
    if (timer) clearTimeout(timer);
    return result;
  }

  private async waitForOrTimeout<T>(work: Promise<T>, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ANSWER_PERSISTENCE_BUDGET_MS);
      timer.unref?.();
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
