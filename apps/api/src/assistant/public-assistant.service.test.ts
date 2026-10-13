import { describe, expect, it, vi } from 'vitest';
import type { AppConfigPort } from '../config/config.port';
import type { AssistantRepositoryPort } from '../ports/assistant.repository';
import type { AssistantRunnerPort } from '../ports/assistant-runner.port';
import type { AssistantEventRecorderPort } from '../ports/assistant-event-recorder.port';
import type { RateLimitPort } from '../ports/rate-limit.port';
import type { SiteContentIndexPort } from '../ports/site-content-index.port';
import type { ConversationRepositoryPort } from '../ports/conversation.repository';
import { ApiError } from '../common/http-error';
import { hashAnonId } from '../auth/anon-cookie';
import { AgentExecutionService, type PublicChatExecutionResult } from '../execution/agent-execution.service';
import { PublicAssistantService } from './public-assistant.service';
import { HOME_XIAOYING_PLACEMENT, PUBLIC_SITE_SCOPE, assistantStreamEventId } from '@walker/shared';

const anonId = 'visitor-cookie-token';
const deployment = {
  deploymentId: 'deployment-1',
  generation: 4,
  agentRevisionId: 'revision-1',
  agentId: 'agent-1',
  revision: 2,
};
const snapshot = {
  buildId: 'build-1',
  collectionHash: 'a'.repeat(64),
  entries: [{ slug: 'post-a', title: '文章 A', summary: '摘要', tags: ['topic'], actionable: false, body: '核验后的公开正文。' }],
};

function makeService(options: {
  aiEnabled?: boolean;
  deployment?: typeof deployment | null;
  snapshotFailure?: boolean;
  executionResult?: unknown;
  sessionOwner?: { anonId: string; runner: string; agentRevisionId?: string | null } | null;
  memberError?: Error;
  sdkSession?: string | null;
  sdkSessions?: Record<string, string>;
  historyDetail?: unknown;
  hangSessionSave?: boolean;
  conversationDeleted?: boolean;
} = {}) {
  const config: AppConfigPort = {
    getDatabaseUrl: () => 'file:test.db',
    isAiEnabled: () => options.aiEnabled ?? true,
    getHost: () => '127.0.0.1',
    getPort: () => 8788,
    getNodeEnv: () => 'test',
    getWorkRootDir: () => '/tmp',
    getWorkMaxUploadBytes: () => 1,
  };
  const execution = {
    runPublicChat: vi.fn(async (input: Parameters<AgentExecutionService['runPublicChat']>[0]): Promise<PublicChatExecutionResult> => {
      const selected = options.executionResult as PublicChatExecutionResult | undefined;
      if (!selected || selected.outcome === 'completed' || selected.reason === 'client-abort') await input.onQueued?.('run-1');
      if (selected?.outcome === 'degraded' && selected.reason === 'client-abort') input.onText?.('partial answer');
      return selected ?? {
        outcome: 'completed',
        runId: 'run-1',
        output: JSON.stringify({ answer: '模型给出的具体回答。', citations: ['post-a', 'private-post'] }),
        sessionId: 'sdk-session-1',
        tokensIn: 12,
        tokensOut: 8,
        elapsedMs: 120,
      };
    }),
  };
  const deployments = {
    resolve: vi.fn(async () => options.deployment === undefined ? deployment : options.deployment),
    resolvePublicMember: vi.fn(async (_placementKey: string, _scopeSlug: string, _memberKey: string | null, _generation: number | null) => {
      if (options.memberError) throw options.memberError;
      return options.deployment === undefined ? deployment : options.deployment;
    }),
    publicHistoryMembers: vi.fn(async () => ({
      generation: 4,
      revisions: new Map([['revision-1', { name: '小影', revision: 2 }]]),
    })),
  };
  const fallback: AssistantRunnerPort = {
    ask: vi.fn(async (input) => ({
      answer: '规则模式回答。',
      citations: [],
      sessionId: input.sessionId ?? 'rule-session',
      aiUsedFlag: false,
      elapsedMs: 0,
    })),
  };
  const repo: AssistantRepositoryPort = {
    upsertSession: vi.fn(async () => {
      if (options.hangSessionSave) await new Promise<void>(() => {});
    }),
    findSession: vi.fn(async () => options.sessionOwner ?? null),
    saveRun: vi.fn(async () => {}),
    listRuns: vi.fn(async () => []),
    findRunByRequest: vi.fn(async () => null),
    bumpRequests: vi.fn(async () => 1),
    addTokens: vi.fn(async () => {}),
  };
  const rateLimit: RateLimitPort = { consume: () => true };
  const events: AssistantEventRecorderPort = {
    record: vi.fn(async () => ({ recorded: true, duplicate: false, queued: false })),
    replayOnce: vi.fn(async () => ({ replayed: 0, pending: 0 })),
    health: vi.fn(async () => ({ status: 'healthy' as const, queuedCount: 0, queuedBytes: 0, oldestQueuedAt: null, droppedCount: 0 })),
  };
  const content: SiteContentIndexPort = {
    loadCitable: async () => snapshot.entries.map(({ body: _body, ...entry }) => entry),
    loadCitableFull: async () => snapshot.entries,
    loadCitableSnapshot: async () => {
      if (options.snapshotFailure) throw new Error('snapshot-unavailable');
      return snapshot;
    },
  };
  const conversations: ConversationRepositoryPort = {
    create: vi.fn(async (input) => ({ ...input, createdAt: '2026-09-24T00:00:00.000Z', updatedAt: '2026-09-24T00:00:00.000Z' })),
    async isDeleted() { return options.conversationDeleted ?? false; },
    detail: vi.fn(async () => options.historyDetail as never ?? null),
    async addVisitorMessage(input) { return { id: input.turnId, conversationId: input.conversationId, seq: 1, requestKey: input.requestKey, createdAt: '2026-09-24T00:00:00.000Z', messages: [], attempts: [] }; },
    async addAttempt(input) { return { ...input, state: 'pending', createdAt: '2026-09-24T00:00:00.000Z' }; },
    async setAttemptRunId() {},
    async setAttemptState() {},
    async addAssistantMessage(input) { return { ...input, role: 'assistant', delivery: 'pending', createdAt: '2026-09-24T00:00:00.000Z' }; },
    setAssistantMessage: vi.fn(async () => {}),
    async setDelivery() {},
    async setAssistantDeliveryForVisitor() { return true; },
    async acknowledgeMessage() { return 'acked'; },
    linkSdkSession: vi.fn(async () => {}),
    sdkSessionFor: vi.fn(async (_conversationId: string, revisionId: string) => options.sdkSessions?.[revisionId] ?? options.sdkSession ?? null),
    async recordEvent() { return 'recorded'; },
  };
  const service = new PublicAssistantService(
    config,
    execution as never,
    deployments as never,
    fallback,
    repo,
    rateLimit,
    events,
    content,
    conversations,
  );
  return { service, execution, deployments, fallback, repo, conversations, events };
}

describe('PublicAssistantService V10', () => {
  it('持久幂等重放保持 accepted → delta → done 的序号和空 runId', async () => {
    const h = makeService();
    vi.mocked(h.repo.findRunByRequest).mockResolvedValue({
      id: 'prior-run', sessionId: 'prior-session', question: '之前的问题', answer: '之前的回答',
      citations: ['post-a'], aiUsedFlag: true, elapsedMs: 12, source: 'assistant-stream', createdAt: '2026-09-28T00:00:00.000Z',
    });
    const frames: Array<{ type: string; sequence: number; eventId: string; runId: string | null }> = [];
    const record = (event: { type: string; sequence: number; eventId: string; runId: string | null }) => {
      frames.push({ type: event.type, sequence: event.sequence, eventId: event.eventId, runId: event.runId });
    };
    const result = await h.service.askStream({
      body: '之前的问题', anonId, ipKey: 'ip-hash', requestKey: 'repeat-key-0001',
      placementKey: 'post-detail', scopeSlug: 'post-a', memberKey: 'public-member-1', deploymentGeneration: 4,
    }, {
      accepted: record,
      delta: record,
      done: record,
      error: () => {},
    });
    expect(frames).toEqual([0, 1, 2].map((sequence, index) => ({
      type: ['accepted', 'delta', 'done'][index], sequence,
      eventId: assistantStreamEventId(result.messageId, sequence), runId: null,
    })));
    expect(h.execution.runPublicChat).not.toHaveBeenCalled();
  });

  it('并发同键请求复用运行并向第二观察者重放完整帧', async () => {
    const h = makeService();
    const input = {
      body: '同一个问题', anonId, ipKey: 'ip-hash', requestKey: 'repeat-key-0002',
      placementKey: 'post-detail', scopeSlug: 'post-a', memberKey: 'public-member-1', deploymentGeneration: 4,
    };
    const first: string[] = [];
    const replayed: Array<{ type: string; sequence: number; runId: string | null }> = [];
    const sink = {
      accepted: (event: { type: string }) => first.push(event.type),
      delta: (event: { type: string }) => first.push(event.type),
      done: (event: { type: string }) => first.push(event.type),
      error: () => {},
    };
    const second = {
      accepted: (event: { type: string; sequence: number; runId: string | null }) => replayed.push(event),
      delta: (event: { type: string; sequence: number; runId: string | null }) => replayed.push(event),
      done: (event: { type: string; sequence: number; runId: string | null }) => replayed.push(event),
      error: () => {},
    };
    const [answer, duplicate] = await Promise.all([
      h.service.askStream(input, sink), h.service.askStream(input, second),
    ]);
    expect(duplicate).toEqual(answer);
    expect(h.execution.runPublicChat).toHaveBeenCalledTimes(1);
    expect(first).toEqual(['accepted', 'done']);
    expect(replayed.map(({ type, sequence, runId }) => ({ type, sequence, runId }))).toEqual([
      { type: 'accepted', sequence: 0, runId: 'run-1' },
      { type: 'delta', sequence: 1, runId: 'run-1' },
      { type: 'done', sequence: 2, runId: 'run-1' },
    ]);
  });
  it('首页全站位置可记录公开部件事件', async () => {
    const h = makeService();
    await expect(h.service.recordInteraction(anonId, 'ip-hash', {
      schemaVersion: 1, eventId: 'home-open-20260928', event: 'open',
      placementKey: HOME_XIAOYING_PLACEMENT, scopeSlug: PUBLIC_SITE_SCOPE,
    })).resolves.toMatchObject({ recorded: true });
  });
  it('首页小影通过当前部署修订读取全站可引用快照并调用模型', async () => {
    const h = makeService();
    const result = await h.service.ask({
      body: 'Dora 是谁？', anonId, ipKey: 'ip-hash', requestKey: 'home-xiaoying-model-1',
      placementKey: HOME_XIAOYING_PLACEMENT, scopeSlug: PUBLIC_SITE_SCOPE,
      memberKey: 'public-member-1', deploymentGeneration: 4,
    });
    expect(result).toMatchObject({ aiUsedFlag: true, answer: '模型给出的具体回答。' });
    expect(h.execution.runPublicChat).toHaveBeenCalledWith(expect.objectContaining({
      placementKey: HOME_XIAOYING_PLACEMENT,
      targetSlug: PUBLIC_SITE_SCOPE,
      contentSnapshotId: snapshot.collectionHash,
      freshPrompt: expect.stringContaining('站点资料（只有这些可引用）：'),
    }));
  });

  it('does not recreate, answer, or restore a conversation after its deletion tombstone', async () => {
    const h = makeService({ conversationDeleted: true });
    await expect(h.service.ask({
      body: '用文章里的方法怎么开始？', anonId, ipKey: 'ip-hash', requestKey: 'public-after-delete',
      placementKey: 'post-detail', scopeSlug: 'post-a', memberKey: 'public-member-1', deploymentGeneration: 4,
    })).rejects.toMatchObject({ status: 410 });
    expect(await h.service.conversationHistory(anonId, 'post-detail', 'post-a')).toMatchObject({ conversationId: null, messages: [] });
    expect(h.conversations.create).not.toHaveBeenCalled();
    expect(h.execution.runPublicChat).not.toHaveBeenCalled();
  });

  it('keeps validated position events on the spool path when database persistence is unavailable', async () => {
    const h = makeService();
    vi.mocked(h.events.record).mockResolvedValue({ recorded: false, duplicate: false, queued: true });
    vi.mocked(h.conversations.detail).mockRejectedValue(new Error('database unavailable'));

    const result = await h.service.recordInteraction(anonId, 'ip-hash', {
      schemaVersion: 1, eventId: 'v16-queued-open-0001', event: 'open',
      placementKey: 'post-detail', scopeSlug: 'post-a', occurredAt: '2026-09-25T00:00:00.000Z',
    });

    expect(result).toEqual({ recorded: false, duplicate: false });
    expect(h.events.record).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'v16-queued-open-0001', featureKey: 'assistant.interaction', event: 'open',
      actorType: 'visitor', conversationId: null,
      props: expect.objectContaining({ placementKey: 'post-detail', scopeSlug: 'post-a' }),
    }));
  });

  it('returns a generated answer when final persistence does not settle', async () => {
    const h = makeService({ hangSessionSave: true });
    const outcome = await Promise.race([
      h.service.ask({
        body: '用文章里的方法怎么开始？', anonId, ipKey: 'ip-hash', requestKey: 'public-key-timeout',
        placementKey: 'post-detail', scopeSlug: 'post-a', memberKey: 'public-member-1', deploymentGeneration: 4,
      }),
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 1_000)),
    ]);

    expect(outcome).not.toBe('timed-out');
    expect(outcome).toMatchObject({ answer: '模型给出的具体回答。', aiUsedFlag: true });
  });

  it('uses the rule answer when deployment storage fails instead of hanging the public response', async () => {
    const h = makeService({ memberError: new Error('database unavailable') });
    const result = await h.service.ask({
      body: '用文章里的方法怎么开始？', anonId, ipKey: 'ip-hash', requestKey: 'public-storage-down',
      placementKey: 'post-detail', scopeSlug: 'post-a', memberKey: 'public-member-1', deploymentGeneration: 4,
    });

    expect(result).toMatchObject({ answer: '规则模式回答。', aiUsedFlag: false });
    expect(h.execution.runPublicChat).not.toHaveBeenCalled();
  });

  it('uses only the enabled revision and verified snapshot through public chat execution', async () => {
    const h = makeService();
    const result = await h.service.ask({
      body: '用文章里的方法怎么开始？',
      anonId,
      ipKey: 'ip-hash',
      requestKey: 'public-key-0001',
      placementKey: 'post-detail',
      scopeSlug: 'post-a',
      memberKey: 'public-member-1',
      deploymentGeneration: 4,
    });

    expect(result).toMatchObject({ answer: '模型给出的具体回答。', aiUsedFlag: true, sessionId: 'sdk-session-1' });
    expect(result.citations).toEqual([{ slug: 'post-a' }]);
    expect(h.execution.runPublicChat).toHaveBeenCalledWith(expect.objectContaining({
      principalId: hashAnonId(anonId),
      runtimeVisitorKey: anonId,
      agentId: 'agent-1',
      agentRevisionId: 'revision-1',
      placementKey: 'post-detail',
      deploymentId: 'deployment-1',
      deploymentGeneration: 4,
      contentSnapshotId: 'a'.repeat(64),
      targetSlug: 'post-a',
    }));
    expect(h.deployments.resolvePublicMember).toHaveBeenCalledWith('post-detail', 'post-a', 'public-member-1', 4);
    expect(h.conversations.linkSdkSession).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: expect.any(String), agentRevisionId: 'revision-1', sdkSessionId: 'sdk-session-1',
    }));
    expect(h.execution.runPublicChat.mock.calls[0]?.[0].prompt).toContain('核验后的公开正文。');
    expect(h.repo.upsertSession).toHaveBeenCalledWith(expect.objectContaining({ agentRevisionId: 'revision-1' }));
    expect(h.repo.saveRun).toHaveBeenCalledWith(expect.objectContaining({ anonIdHash: hashAnonId(anonId), requestKey: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  });

  it('模型没写完就到了预算上限：交付已生成的部分并标 partial，不换成规则文案', async () => {
    // 这条盯的是产品语义：访客在流里已经看到这些字了，服务端不能把它换成
    // 「（规则模式）…当前 AI 未启用」——那等于把已经提供的服务说成没提供。
    const h = makeService({
      executionResult: {
        outcome: 'completed',
        runId: 'run-1',
        partial: true,
        output: '{"answer":"站里那篇讲花销的文章说，正常渠道一个月要一两百',
        sessionId: 'sdk-session-1',
        tokensIn: 120,
        tokensOut: 40,
        elapsedMs: 15_100,
      },
    });
    const result = await h.service.ask({
      body: '花销大概多少？',
      anonId,
      ipKey: 'ip-hash',
      requestKey: 'public-key-partial',
      placementKey: 'post-detail',
      scopeSlug: 'post-a',
      memberKey: 'public-member-1',
      deploymentGeneration: 4,
    });
    expect(result.partial).toBe(true);
    expect(result.aiUsedFlag).toBe(true);
    expect(result.answer).toBe('站里那篇讲花销的文章说，正常渠道一个月要一两百');
    expect(result.citations).toEqual([]);
    expect(h.fallback.ask).not.toHaveBeenCalled();
  });

  it('keeps an old request without placement on the rule path', async () => {
    const h = makeService();
    const result = await h.service.ask({ body: '请帮我看看', anonId, ipKey: 'ip-hash' });
    expect(result.aiUsedFlag).toBe(false);
    expect(h.execution.runPublicChat).not.toHaveBeenCalled();
    expect(h.deployments.resolve).not.toHaveBeenCalled();
    expect(h.repo.saveRun).toHaveBeenCalledWith(expect.objectContaining({ degradeReason: 'deployment-disabled' }));
  });

  it('does not start the model when AI is disabled or the verified snapshot is unavailable', async () => {
    const disabled = makeService({ aiEnabled: false });
    const events: string[] = [];
    await disabled.service.askStream({ body: '一个问题', anonId, ipKey: 'ip-hash', placementKey: 'post-detail', scopeSlug: 'post-a', memberKey: 'public-member-1', deploymentGeneration: 4 }, {
      accepted: () => events.push('accepted'),
      delta: (event) => { events.push('delta'); expect(event.delta).toBe('规则模式回答。'); },
      done: (event) => { events.push('done'); expect(event.result.aiUsedFlag).toBe(false); },
      error: () => { events.push('error'); },
    });
    expect(disabled.execution.runPublicChat).not.toHaveBeenCalled();
    expect(events).toEqual(['accepted', 'delta', 'done']);

    const missing = makeService({ snapshotFailure: true });
    const result = await missing.service.ask({ body: '一个问题', anonId, ipKey: 'ip-hash', placementKey: 'post-detail', scopeSlug: 'post-a', memberKey: 'public-member-1', deploymentGeneration: 4 });
    expect(result.aiUsedFlag).toBe(false);
    expect(missing.execution.runPublicChat).not.toHaveBeenCalled();
    expect(missing.repo.saveRun).toHaveBeenCalledWith(expect.objectContaining({ degradeReason: 'snapshot-unavailable' }));
  });

  it('does not reuse a visitor SDK session from another revision', async () => {
    const h = makeService({ sessionOwner: { anonId: hashAnonId(anonId), runner: 'harness', agentRevisionId: 'revision-old' } });
    await h.service.ask({ body: '继续问', anonId, ipKey: 'ip-hash', sessionId: 'sdk-session-old', placementKey: 'post-detail', scopeSlug: 'post-a', memberKey: 'public-member-1', deploymentGeneration: 4 });
    expect(h.execution.runPublicChat.mock.calls[0]?.[0].runtimeSessionId).toBeNull();
    expect(h.repo.findSession).not.toHaveBeenCalled();
    expect(h.conversations.sdkSessionFor).toHaveBeenCalledWith(expect.any(String), 'revision-1');
  });

  it('switches to the selected revision branch and restores only that branch SDK session', async () => {
    const h = makeService({ sdkSessions: { 'revision-2': 'sdk-session-revision-2' } });
    h.deployments.resolvePublicMember.mockImplementation(async (_placementKey, _scopeSlug, memberKey) => memberKey === 'public-member-2'
      ? { ...deployment, agentId: 'agent-2', agentRevisionId: 'revision-2', revision: 1 }
      : deployment);
    await h.service.ask({
      body: '换一个成员继续', anonId, ipKey: 'ip-hash', placementKey: 'post-detail', scopeSlug: 'post-a',
      memberKey: 'public-member-2', deploymentGeneration: 4,
    });
    expect(h.execution.runPublicChat).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'agent-2', agentRevisionId: 'revision-2', runtimeSessionId: 'sdk-session-revision-2',
    }));
    expect(h.conversations.linkSdkSession).toHaveBeenCalledWith(expect.objectContaining({
      agentRevisionId: 'revision-2', sdkSessionId: 'sdk-session-1',
    }));
  });

  it('falls back when the unified public queue cannot admit the run', async () => {
    const h = makeService({ executionResult: { outcome: 'degraded', reason: 'queue-full' } });
    const result = await h.service.ask({ body: '再问一个问题', anonId, ipKey: 'ip-hash', placementKey: 'post-detail', scopeSlug: 'post-a', memberKey: 'public-member-1', deploymentGeneration: 4 });
    expect(result.aiUsedFlag).toBe(false);
    expect(h.repo.saveRun).toHaveBeenCalledWith(expect.objectContaining({ degradeReason: 'queue-full' }));
  });

  it('does not emit done or save a final answer after the visitor disconnects mid-stream', async () => {
    const h = makeService({ executionResult: { outcome: 'degraded', reason: 'client-abort' } });
    const events: string[] = [];
    const result = await h.service.askStream({
      body: '请给我一个建议', anonId, ipKey: 'ip-hash',
      placementKey: 'post-detail', scopeSlug: 'post-a',
      requestKey: 'public-abort-0001', signal: AbortSignal.abort(),
      memberKey: 'public-member-1', deploymentGeneration: 4,
    }, {
      accepted: () => events.push('accepted'),
      delta: (event) => { events.push('delta'); expect(event.delta).toBe('partial answer'); },
      done: () => events.push('done'),
      error: (event) => { events.push('error'); expect(event.code).toBe('client-abort'); },
    });

    expect(events).toEqual(['accepted', 'delta', 'error']);
    expect(result.answer).toBe('partial answer');
    expect((h.conversations.setAssistantMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toMatchObject({
      body: 'partial answer', delivery: 'partial',
    });
    expect(h.repo.saveRun).not.toHaveBeenCalled();
  });

  it('rejects a stale placement selection before writing a turn or starting a run', async () => {
    const h = makeService({ memberError: new ApiError('placement-generation-conflict', 409) });
    await expect(h.service.ask({
      body: '继续问', anonId, ipKey: 'ip-hash', requestKey: 'public-stale-0001',
      placementKey: 'post-detail', scopeSlug: 'post-a', memberKey: 'old-member', deploymentGeneration: 3,
    })).rejects.toMatchObject({ status: 409 });
    expect(h.conversations.create).not.toHaveBeenCalled();
    expect(h.execution.runPublicChat).not.toHaveBeenCalled();
  });

  it('restores only same-visitor messages and hides answers from revisions no longer public', async () => {
    const h = makeService({
      historyDetail: {
        id: 'visitor-conversation', anonId: hashAnonId(anonId), placementKey: 'post-detail', scopeSlug: 'post-a',
        createdAt: '2026-09-24T00:00:00.000Z', updatedAt: '2026-09-24T00:00:00.000Z', sdkSessions: [{ agentRevisionId: 'revision-1', sdkSessionId: 'private-sdk-session' }],
        turns: [{
          id: 'turn-1', conversationId: 'visitor-conversation', seq: 1, requestKey: 'opaque-request-key', createdAt: '2026-09-24T00:00:00.000Z',
          attempts: [
            { id: 'attempt-old', turnId: 'turn-1', agentRevisionId: 'revision-old', runId: 'private-run', state: 'generated', createdAt: '2026-09-24T00:00:01.000Z' },
            { id: 'attempt-current', turnId: 'turn-1', agentRevisionId: 'revision-1', runId: 'private-run-2', state: 'generated', createdAt: '2026-09-24T00:00:02.000Z' },
            { id: 'attempt-stopped', turnId: 'turn-1', agentRevisionId: 'revision-1', runId: 'private-run-3', state: 'cancelled', createdAt: '2026-09-24T00:00:03.000Z' },
          ],
          messages: [
            { id: 'visitor-message', turnId: 'turn-1', attemptId: null, role: 'visitor', body: '脱敏过的问题', delivery: 'ack', createdAt: '2026-09-24T00:00:00.000Z' },
            { id: 'old-answer', turnId: 'turn-1', attemptId: 'attempt-old', role: 'assistant', body: '不再公开的旧回答', delivery: 'ack', createdAt: '2026-09-24T00:00:01.000Z' },
            { id: 'current-answer', turnId: 'turn-1', attemptId: 'attempt-current', role: 'assistant', body: '当前公开成员的回答', delivery: 'sent', createdAt: '2026-09-24T00:00:02.000Z' },
            { id: 'stopped-answer', turnId: 'turn-1', attemptId: 'attempt-stopped', role: 'assistant', body: '用户停止前的片段', delivery: 'unknown', createdAt: '2026-09-24T00:00:03.000Z' },
          ],
        }],
      },
    });
    const history = await h.service.conversationHistory(anonId, 'post-detail', 'post-a');
    expect(history.messages).toMatchObject([
      { id: 'visitor-message', role: 'visitor', text: '脱敏过的问题' },
      { id: 'old-answer', role: 'assistant', text: '', delivery: 'unavailable', hidden: true },
      { id: 'current-answer', role: 'assistant', text: '当前公开成员的回答', member: { name: '小影', revision: 2 } },
      { id: 'stopped-answer', role: 'assistant', text: '用户停止前的片段', delivery: 'partial', stopped: true, member: { name: '小影', revision: 2 } },
    ]);
    expect(JSON.stringify(history)).not.toContain('private-sdk-session');
    expect(JSON.stringify(history)).not.toContain('private-run');
    expect(JSON.stringify(history)).not.toContain('revision-1');
  });
});
