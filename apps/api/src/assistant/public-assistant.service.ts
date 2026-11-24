import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  placementContentAvailable,
  type AssistantRunResult,
  type DegradeReason,
  type PublicConversationHistory,
  type PublicAssistantStopStatus,
  type PublicPlacementManifest,
} from '@walker/shared';
import { newId } from '../common/ids';
import { ApiError, validationError } from '../common/http-error';
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
import {
  MESSAGE_ID_RE,
  raceWithBudget,
  resolveAssistantDailyLimit,
  todayCN,
} from './assistant-common';
import {
  createAnswerDelivery,
  deliverDuplicateAnswer,
  deliverStoppedAnswer,
  emitAcceptedFrame,
  replayStreamFrames,
  type AnswerDelivery,
  type ConversationContext,
  type PublicAssistantAskInput,
  type PublicAssistantAskResult,
  type PublicAssistantGate,
  type PublicAssistantStreamSink,
} from './public-assistant-stream';
import {
  completePublicModelAnswer,
  finishPublicAssistantRun,
} from './public-assistant-completion';
import {
  attachConversationAttempt,
  ensureVisitorConversation,
  loadVisitorConversationHistory,
  preflightVisitorAsk,
  recordVisitorInteraction,
  resolveLogicalConversationId,
  stopVisitorMessage,
} from './public-assistant-conversation';

export type {
  PublicAssistantAskInput,
  PublicAssistantAskResult,
  PublicAssistantStreamSink,
};

export const PUBLIC_ASSISTANT_TIMEOUT_MS = (() => {
  const value = Number(process.env.WALKER_ASSISTANT_ASK_TIMEOUT_MS?.trim());
  return Number.isFinite(value) && value >= 1_000 ? value : 15_000;
})();

const ANSWER_PERSISTENCE_BUDGET_MS = 250;

type PublicDeployment = NonNullable<Awaited<ReturnType<DeploymentService['resolvePublicMember']>>>;
type CitableSnapshot = Awaited<ReturnType<SiteContentIndexPort['loadCitableSnapshot']>>;

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
    this.dailyLimit = resolveAssistantDailyLimit();
  }

  ask(input: PublicAssistantAskInput): Promise<PublicAssistantAskResult> {
    return this.once(input, () => this.run(input));
  }

  askStream(
    input: PublicAssistantAskInput,
    sink: PublicAssistantStreamSink,
  ): Promise<PublicAssistantAskResult> {
    return this.once(input, () => this.run(input, sink), sink);
  }

  async placementManifest(placementKey: string, scopeSlug: string): Promise<PublicPlacementManifest> {
    const manifest = await this.deployments.publicManifest(placementKey, scopeSlug);
    return { ...manifest, aiEnabled: this.config.isAiEnabled() };
  }

  conversationHistory(anonId: string, placementKey: string, scopeSlug: string): Promise<PublicConversationHistory> {
    return loadVisitorConversationHistory(
      { content: this.content, conversations: this.conversations, deployments: this.deployments },
      anonId,
      placementKey,
      scopeSlug,
    );
  }

  stopMessage(
    anonId: string,
    placementKey: string,
    scopeSlug: string,
    messageId: string,
  ): Promise<PublicAssistantStopStatus> {
    return stopVisitorMessage(
      { conversations: this.conversations, execution: this.execution },
      anonId,
      placementKey,
      scopeSlug,
      messageId,
    );
  }

  recordInteraction(anonId: string, ipKey: string, raw: unknown) {
    return recordVisitorInteraction(
      {
        rateLimit: this.rateLimit,
        content: this.content,
        conversations: this.conversations,
        deployments: this.deployments,
        repo: this.repo,
        events: this.events,
        placementManifest: (placementKey, scopeSlug) => this.placementManifest(placementKey, scopeSlug),
        waitOptional: (work, fallback) => this.waitForOptionalValue(work, fallback),
      },
      anonId,
      ipKey,
      raw,
    );
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
    if (!MESSAGE_ID_RE.test(messageId)) throw validationError('message-id-invalid');
    const outcome = await this.conversations.acknowledgeMessage(messageId, hashAnonId(anonId));
    if (outcome === 'not-found') throw new ApiError('assistant-message-not-found', 404, '找不到这条消息');
    if (outcome === 'not-sent') throw new ApiError('assistant-message-not-sent', 409, '消息尚未发送');
    return { acknowledged: true, duplicate: outcome === 'duplicate' };
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
      replayStreamFrames(result, stream);
      return result;
    });
    const pending = Promise.resolve().then(run).finally(() => { this.inFlight.delete(key); });
    this.inFlight.set(key, pending);
    return pending;
  }

  private async fallbackAnswer(options: {
    input: PublicAssistantAskInput;
    gate: PublicAssistantGate;
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

  private executePublicModel(options: {
    input: PublicAssistantAskInput;
    gate: PublicAssistantGate;
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
      conversationId: delivery.state.conversation?.id ?? resolveLogicalConversationId(input, gate.anonHash),
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
        if (delivery.state.conversation?.attemptId) {
          await this.conversations.setAttemptRunId(delivery.state.conversation.attemptId, queuedRunId).catch(() => {});
        }
      },
      onText: delivery.emitDelta,
    });
  }

  private async run(
    input: PublicAssistantAskInput,
    stream?: PublicAssistantStreamSink,
  ): Promise<PublicAssistantAskResult> {
    const gate = await this.preflight(input);
    const logicalConversationId = resolveLogicalConversationId(input, gate.anonHash);
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
      return deliverDuplicateAnswer(
        {
          conversations: this.conversations,
          ensureConversation: () => ensureVisitorConversation(this.conversations, input, gate),
        },
        { gate, prior: gate.duplicate, modelAvailable: aiEnabled && Boolean(deployment), stream },
      );
    }
    const conversation = await this.waitForOptionalValue(ensureVisitorConversation(this.conversations, input, gate), null);
    emitAcceptedFrame(gate, stream);
    const delivery = createAnswerDelivery({ conversations: this.conversations }, gate, stream, conversation);
    const fallbackResult = (reason: DegradeReason) => this.fallbackAnswer({ input, gate, delivery, reason });

    if (this.jevFastPath.isEnabled()) {
      const fastPath = await this.jevFastPath.check(gate.redactedText);
      if (fastPath) {
        delivery.emitDelta(fastPath.result.answer);
        await this.waitForAnswerPersistence(delivery.waitWrites());
        const finished = await this.finish({ input, gate, result: fastPath.result, runId: null, conversation: delivery.state.conversation });
        delivery.emitDone(finished);
        return finished;
      }
    }

    if (!aiEnabled) return fallbackResult('ai-disabled');
    if (!placementKey || !scopeSlug || !deployment) return fallbackResult('deployment-disabled');

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
    delivery.state.conversation = await attachConversationAttempt(this.conversations, delivery.state.conversation, gate, deployment.agentRevisionId);

    const budget = await this.useBudget(gate.actorType, delivery.state.conversation?.id ?? logicalConversationId);
    if (budget.reason) return fallbackResult(budget.reason);

    const sessionId = delivery.state.conversation
      ? await this.conversations.sdkSessionFor(delivery.state.conversation.id, deployment.agentRevisionId).catch(() => null)
      : await this.ownedRuntimeSession(input, gate.anonHash, deployment.agentRevisionId);
    const prompt = sessionId ? gate.redactedText : buildFirstTurnPrompt(snapshot.entries, gate.redactedText, null);
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
        return deliverStoppedAnswer(
          { conversations: this.conversations },
          { gate, delivery, reason: execution.reason, sessionId, startedAt },
        );
      }
      return fallbackResult(execution.reason);
    }

    return completePublicModelAnswer(
      {
        conversations: this.conversations,
        waitPersistence: (work) => this.waitForAnswerPersistence(work),
        fallbackAnswer: (reason) => fallbackResult(reason),
        finish: (opts) => this.finish({ input, gate, ...opts }),
      },
      { delivery, agentRevisionId: deployment.agentRevisionId, execution, citableSlugs, startedAt },
    );
  }

  private preflight(input: PublicAssistantAskInput): Promise<PublicAssistantGate> {
    return preflightVisitorAsk(
      {
        rateLimit: this.rateLimit,
        conversations: this.conversations,
        repo: this.repo,
        safeEvent: (event) => { void this.safeEvent(event); },
        waitOptional: (work, fallback) => this.waitForOptionalValue(work, fallback),
      },
      input,
    );
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

  private async useBudget(actorType: PublicAssistantGate['actorType'], conversationId: string | null): Promise<{ reason: DegradeReason | null }> {
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

  private finish(options: {
    input: PublicAssistantAskInput;
    gate: PublicAssistantGate;
    result: AssistantRunResult;
    agentRevisionId?: string;
    runId: string | null;
    conversation: ConversationContext | null;
  }): Promise<PublicAssistantAskResult> {
    return finishPublicAssistantRun(
      {
        conversations: this.conversations,
        repo: this.repo,
        waitPersistence: (work) => this.waitForAnswerPersistence(work),
        safeEvent: (event) => this.safeEvent(event),
        resolvedConversationId: options.conversation?.id ?? resolveLogicalConversationId(options.input, options.gate.anonHash),
      },
      options,
    );
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
    return this.events.record({ id, eventId: id, ...input, conversationId: input.conversationId ?? null }).then(() => {}).catch(() => {});
  }

  private waitForAnswerPersistence(work: Promise<unknown>): Promise<void> {
    return this.waitForOptionalValue(work, undefined).then(() => {});
  }

  private waitForOptionalValue<T>(work: Promise<T>, fallback: T): Promise<T> {
    return raceWithBudget(work, ANSWER_PERSISTENCE_BUDGET_MS, fallback, true);
  }

  private waitForOrTimeout<T>(work: Promise<T>, fallback: T): Promise<T> {
    return raceWithBudget(work, ANSWER_PERSISTENCE_BUDGET_MS, fallback, false);
  }
}
