import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { hashAnonId } from '../auth/anon-cookie';
import { AppModule } from '../app.module';
import { APP_CONFIG } from '../config/config.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { ASSISTANT_RUNNER } from '../ports/assistant-runner.port';
import { SITE_CONTENT_INDEX } from '../ports/site-content-index.port';

describe('public assistant route uses the deployment-gated service', () => {
  let app: INestApplication;
  let baseUrl: string;
  let db: PrismaClient;
  const legacyRunner = {
    ask: vi.fn(async () => { throw new Error('legacy public runner was called'); }),
    askStream: vi.fn(async () => { throw new Error('legacy public runner was called'); }),
  };

  beforeAll(async () => {
    vi.stubEnv('WALKER_ADMIN_TOKEN', 'v16-health-test-token');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue({
        getDatabaseUrl: () => process.env.DATABASE_URL ?? '',
        isAiEnabled: () => true,
        getHost: () => '127.0.0.1',
        getPort: () => 8788,
        getNodeEnv: () => 'test',
        getWorkRootDir: () => '/tmp',
        getWorkMaxUploadBytes: () => 1024,
      })
      .overrideProvider(ASSISTANT_RUNNER)
      .useValue(legacyRunner)
      .overrideProvider(SITE_CONTENT_INDEX)
      .useValue({
        loadCitable: async () => [{ slug: 'post-a', title: '文章 A', summary: '摘要', tags: [], actionable: false }],
        loadCitableFull: async () => [{ slug: 'post-a', title: '文章 A', summary: '摘要', tags: [], actionable: false, body: '已核验的公开正文。' }],
        loadCitableSnapshot: async () => ({ buildId: 'test', collectionHash: 'a'.repeat(64), entries: [{ slug: 'post-a', title: '文章 A', summary: '摘要', tags: [], actionable: false, body: '已核验的公开正文。' }] }),
      })
      .compile();
    app = module.createNestApplication({ logger: false });
    db = module.get<PrismaPort>(PRISMA).getClient()!;
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  }, 30_000);

  afterAll(async () => {
    const owners = [hashAnonId('a'.repeat(64)), hashAnonId('c'.repeat(64)), hashAnonId('e'.repeat(64)), hashAnonId('g'.repeat(64))];
    const conversations = await db?.conversation.findMany({ where: { anonId: { in: owners } }, select: { id: true } });
    const ids = conversations?.map((conversation) => conversation.id) ?? [];
    await db?.conversationLogResource.deleteMany({ where: { conversationId: { in: ids } } });
    await db?.featureEvent.deleteMany({ where: { eventId: { startsWith: 'v15-event-' } } });
    await db?.executionRun.deleteMany({ where: { id: { in: ['v14-public-run', 'v14-admin-run'] } } });
    await db?.featureEvent.deleteMany({ where: { conversationId: { in: ids } } });
    await db?.conversation.deleteMany({ where: { id: { in: ids } } });
    await app?.close();
    vi.unstubAllEnvs();
  });

  it('serves spool health only behind the admin token', async () => {
    const denied = await fetch(`${baseUrl}/admin/assistant-events/health`, {
      headers: { accept: 'application/json' },
    });
    expect(denied.status).toBe(401);

    const response = await fetch(`${baseUrl}/admin/assistant-events/health`, {
      headers: { accept: 'application/json', 'x-admin-token': 'v16-health-test-token' },
    });
    expect(response.status).toBe(200);
    const health = await response.json() as { status: string; queuedCount: number | null; droppedCount: number | null };
    expect(['healthy', 'backlog', 'loss-unknown']).toContain(health.status);
    expect(health).toHaveProperty('queuedCount');
    expect(health).toHaveProperty('droppedCount');
  });

  it('protects retention/resource inspection and does not accept filesystem paths', async () => {
    const denied = await fetch(`${baseUrl}/admin/log-retention`, { headers: { accept: 'application/json' } });
    expect(denied.status).toBe(401);

    const headers = { accept: 'application/json', 'x-admin-token': 'v16-health-test-token' };
    const policyResponse = await fetch(`${baseUrl}/admin/log-retention`, { headers });
    expect(policyResponse.status).toBe(200);
    expect(await policyResponse.json()).toEqual(expect.objectContaining({
      detailRetentionDays: expect.any(Number), aggregateRetentionDays: expect.any(Number),
    }));

    const resources = await fetch(`${baseUrl}/admin/log-resources/conversations/no-such-conversation`, { headers });
    expect(resources.status).toBe(200);
    expect(await resources.json()).toMatchObject({ conversationId: 'no-such-conversation', resources: [] });

    const invalid = await fetch(`${baseUrl}/admin/log-retention`, {
      method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ detailRetentionDays: 30, aggregateRetentionDays: 180, path: '/private/file' }),
    });
    expect(invalid.status).toBe(400);

    const crossOrigin = await fetch(`${baseUrl}/admin/log-retention`, {
      method: 'PATCH', headers: { ...headers, origin: 'https://attacker.example', 'content-type': 'application/json' },
      body: JSON.stringify({ detailRetentionDays: 30, aggregateRetentionDays: 180 }),
    });
    expect(crossOrigin.status).toBe(403);
  });

  it('denies cross-origin public writes and keeps ops/content writes behind credentials', async () => {
    const eventId = 'v22-public-csrf-event-0001';
    const crossOriginEvent = await fetch(`${baseUrl}/assistant/events`, {
      method: 'POST',
      headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1, eventId, event: 'expose', placementKey: 'post-detail', scopeSlug: 'post-a',
      }),
    });
    expect(crossOriginEvent.status).toBe(403);
    expect(await db.featureEvent.findUnique({ where: { eventId } })).toBeNull();

    const wrongMethod = await fetch(`${baseUrl}/ops/exports`, { headers: { accept: 'application/json' } });
    expect(wrongMethod.status).toBe(401);
    const unlistedSupport = await fetch(`${baseUrl}/support`, { headers: { accept: 'application/json' } });
    expect(unlistedSupport.status).toBe(401);
    const crossOriginContentWrite = await fetch(`${baseUrl}/admin/content/v22-csrf-check`, {
      method: 'PUT', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
      body: JSON.stringify({ raw: 'visitor write must not reach content' }),
    });
    expect(crossOriginContentWrite.status).toBe(403);
    const contentWrite = await fetch(`${baseUrl}/admin/content/post-a`, {
      method: 'PUT', headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ raw: 'visitor write must not reach content' }),
    });
    expect(contentWrite.status).toBe(401);

    const preflight = await fetch(`${baseUrl}/admin/content/post-a`, {
      method: 'OPTIONS', headers: { origin: 'https://attacker.example', 'access-control-request-method': 'PUT' },
    });
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('keeps the legacy DTO accepted while missing placement stays on rule fallback', async () => {
    const response = await fetch(`${baseUrl}/assistant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: '我想了解文章内容' }),
    });
    const body = await response.json() as { answer?: string; aiUsedFlag?: boolean };

    expect(response.status).toBe(201);
    expect(body.answer).toBeTruthy();
    expect(body.aiUsedFlag).toBe(false);
    expect(legacyRunner.ask).not.toHaveBeenCalled();
    expect(legacyRunner.askStream).not.toHaveBeenCalled();
  });

  it('serves a public placement manifest without exposing private deployment data', async () => {
    const response = await fetch(`${baseUrl}/assistant/placements/post-detail/post-a`);
    const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body).toEqual({
      placementKey: 'post-detail',
      scopeSlug: 'post-a',
      label: '文章详情',
      available: false,
      aiEnabled: true,
      generation: null,
      members: [],
      defaultMemberKey: null,
    });
  });

  it('opens the event stream with HTTP 200', async () => {
    const response = await fetch(`${baseUrl}/assistant/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `walker-anon=${'c'.repeat(64)}` },
      body: JSON.stringify({ body: '请给我一个建议' }),
    });
    expect(response.status).toBe(200);
    await response.text();
  });

  it('streams accepted/delta/done with stable IDs and never emits raw model JSON', async () => {
    const response = await fetch(`${baseUrl}/assistant/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `walker-anon=${'c'.repeat(64)}` },
      body: JSON.stringify({ body: '请给我一个建议', requestKey: 'stream-v2-key-0001', placementKey: 'post-detail', scopeSlug: 'post-a' }),
    });
    const source = await response.text();
    const frames = source.trim().split('\n\n');
    const events = frames.map((frame) => {
      const type = frame.split('\n').find((line) => line.startsWith('event: '))?.slice(7);
      const data = frame.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
      return { type, data: data ? JSON.parse(data) as Record<string, unknown> : null };
    });

    expect(events.map((event) => event.type)).toEqual(['accepted', 'delta', 'done']);
    const [accepted, delta, done] = events.map((event) => event.data!);
    expect(accepted).toMatchObject({ sequence: 0, requestId: 'stream-v2-key-0001' });
    expect(delta).toMatchObject({ messageId: accepted.messageId, attemptId: accepted.attemptId, sequence: 1 });
    expect(String(delta.delta)).toContain('规则模式');
    expect(delta.eventId).toBe(`${String(delta.messageId)}:1`);
    expect(done).toMatchObject({ messageId: accepted.messageId, attemptId: accepted.attemptId, sequence: 2 });
    expect(done.result).toMatchObject({ answer: expect.any(String), aiUsedFlag: false });
    const finalAnswer = (done.result as { answer: string }).answer;
    expect(String(delta.delta)).not.toContain('citations');
    expect(source).not.toContain('{"answer"');
    const ownerHash = hashAnonId('c'.repeat(64));
    await vi.waitFor(async () => {
      const conversation = await db.conversation.findFirst({
        where: { anonId: ownerHash, placementKey: 'post-detail', scopeSlug: 'post-a' },
        include: { turns: { include: { messages: true, attempts: true } } },
      });
      const messages = conversation?.turns.flatMap((turn) => turn.messages) ?? [];
      expect(messages.find((message) => message.id === accepted.messageId)).toMatchObject({
        body: finalAnswer,
        delivery: 'sent',
      });
      expect(messages.some((message) => message.role === 'visitor' && message.body === '请给我一个建议')).toBe(true);
    });

    const historyResponse = await fetch(`${baseUrl}/assistant/conversations/post-detail/post-a`, {
      headers: { cookie: `walker-anon=${'c'.repeat(64)}` },
    });
    const history = await historyResponse.json() as { conversationId: string | null; messages: Array<Record<string, unknown>> };
    expect(historyResponse.status).toBe(200);
    expect(historyResponse.headers.get('cache-control')).toBe('private, no-store');
    expect(history.conversationId).toBeTruthy();
    expect(history.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'visitor', text: '请给我一个建议' }),
      expect.objectContaining({ role: 'assistant', text: finalAnswer, delivery: 'sent', member: null }),
    ]));
    expect(JSON.stringify(history)).not.toContain('sdk-session');
    expect(JSON.stringify(history)).not.toContain('anonId');
    let registeredResources: Array<{ resourceType: string }> = [];
    await vi.waitFor(async () => {
      registeredResources = await db.conversationLogResource.findMany({
        where: { conversationId: history.conversationId }, select: { resourceType: true },
      });
      expect(registeredResources.map((resource) => resource.resourceType)).toContain('assistant-run');
    }, { timeout: 2_000 });
    expect(new Set(registeredResources.map((resource) => resource.resourceType))).toEqual(
      new Set(['message', 'assistant-run', 'event']),
    );
    const otherVisitor = await (await fetch(`${baseUrl}/assistant/conversations/post-detail/post-a`, {
      headers: { cookie: `walker-anon=${'d'.repeat(64)}` },
    })).json() as { conversationId: string | null; messages: unknown[] };
    expect(otherVisitor).toMatchObject({ conversationId: null, messages: [] });

    const interaction = await fetch(`${baseUrl}/assistant/events`, {
      method: 'POST',
      headers: { cookie: `walker-anon=${'c'.repeat(64)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1, eventId: 'v15-event-send-0001', event: 'send',
        placementKey: 'post-detail', scopeSlug: 'post-a', messageId: accepted.messageId,
        occurredAt: '2001-01-01T00:00:00.000Z',
      }),
    });
    expect(interaction.status).toBe(201);
    expect(await interaction.json()).toEqual({ recorded: true, duplicate: false });
    expect(await db.featureEvent.findUniqueOrThrow({ where: { eventId: 'v15-event-send-0001' } })).toMatchObject({
      featureKey: 'assistant.interaction', event: 'send', actorType: 'visitor', conversationId: history.conversationId,
      props: { placementKey: 'post-detail', scopeSlug: 'post-a', messageId: accepted.messageId, clientOccurredAt: '2001-01-01T00:00:00.000Z' },
    });
    const storedEvent = await db.featureEvent.findUniqueOrThrow({ where: { eventId: 'v15-event-send-0001' } });
    expect(await db.conversationLogResource.findFirst({
      where: { conversationId: history.conversationId, resourceType: 'event', resourceKey: storedEvent.id },
    })).toBeTruthy();
    const nonCitation = await fetch(`${baseUrl}/assistant/events`, {
      method: 'POST',
      headers: { cookie: `walker-anon=${'c'.repeat(64)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1, eventId: 'v15-event-fake-citation-0001', event: 'citation-click',
        placementKey: 'post-detail', scopeSlug: 'post-a', messageId: accepted.messageId, targetSlug: 'post-a',
      }),
    });
    expect(nonCitation.status).toBe(404);
    expect(await db.featureEvent.findUnique({ where: { eventId: 'v15-event-fake-citation-0001' } })).toBeNull();
  });

  it('returns a stable v2 error frame for invalid stream input', async () => {
    const response = await fetch(`${baseUrl}/assistant/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'x' }),
    });
    const source = await response.text();
    const frame = source.trim().split('\n\n')[0]!;
    const eventId = frame.split('\n').find((line) => line.startsWith('id: '))?.slice(4);
    const data = JSON.parse(frame.split('\n').find((line) => line.startsWith('data: '))!.slice(6));
    expect(frame).toContain('event: error');
    expect(data).toMatchObject({ version: 2, type: 'error', code: 'assistant-stream-failed', sequence: 0 });
    expect(eventId).toBe(`${data.messageId}:0`);
    expect(data.messageId).toBe(data.requestId);
  });

  it('acknowledges only the owning visitor and duplicate ACK is idempotent', async () => {
    const cookie = 'a'.repeat(64);
    const messageId = 'message-1234567890abcdef12345678';
    await db.conversation.create({ data: {
      id: 'v11-ack-conversation', anonId: hashAnonId(cookie), placementKey: 'post-detail', scopeSlug: 'post-a',
    } });
    await db.conversationTurn.create({ data: {
      id: 'v11-ack-turn', conversationId: 'v11-ack-conversation', seq: 1, requestKey: 'v11-ack-key',
    } });
    await db.conversationMessage.create({
      data: { id: messageId, turnId: 'v11-ack-turn', role: 'assistant', body: '已发出的回答', delivery: 'sent' },
    });
    const request = () => fetch(`${baseUrl}/assistant/messages/${messageId}/ack`, {
      method: 'POST', headers: { cookie: `walker-anon=${cookie}`, 'content-type': 'application/json' }, body: '{}',
    });

    const first = await request();
    const firstBody = await first.json() as { acknowledged?: boolean; duplicate?: boolean };
    const second = await request();
    const secondBody = await second.json() as { acknowledged?: boolean; duplicate?: boolean };
    const other = await fetch(`${baseUrl}/assistant/messages/${messageId}/ack`, {
      method: 'POST', headers: { cookie: `walker-anon=${'b'.repeat(64)}`, 'content-type': 'application/json' }, body: '{}',
    });

    expect(first.status).toBe(201);
    expect(firstBody).toEqual({ acknowledged: true, duplicate: false });
    expect(secondBody).toEqual({ acknowledged: true, duplicate: true });
    expect(other.status).toBe(404);
    expect(await db.conversationMessage.count({ where: { id: messageId, delivery: 'ack' } })).toBe(1);
    expect(await db.featureEvent.count({ where: { eventId: `assistant-ack:${hashAnonId(cookie)}:${messageId}` } })).toBe(1);
  });

  it('stops only a public run bound to the same visitor conversation and never stops an admin run', async () => {
    const cookie = 'e'.repeat(64);
    const anonHash = hashAnonId(cookie);
    const conversationId = `conversation-${createHash('sha256').update(`${anonHash}\npost-detail\npost-a\nconversation`).digest('hex').slice(0, 24)}`;
    await db.conversation.create({ data: {
      id: conversationId, anonId: anonHash, placementKey: 'post-detail', scopeSlug: 'post-a',
    } });
    await db.conversationTurn.create({ data: {
      id: 'v14-turn-public', conversationId, seq: 1, requestKey: 'v14-public-key',
    } });
    await db.executionRun.create({ data: {
      id: 'v14-public-run', kind: 'chat', origin: 'public', actor: anonHash, actorScope: `public:${anonHash}`,
      placementKey: 'post-detail', deploymentId: 'v14-deployment', deploymentGeneration: 2,
      contentSnapshotId: 'a'.repeat(64), requestKey: 'v14-public-key', inputHash: 'b'.repeat(64),
      resourceScope: { kind: 'content', ids: ['post-a'] }, state: 'QUEUED',
    } });
    const publicMessageId = 'message-aaaaaaaaaaaaaaaaaaaaaaaa';
    await db.conversationAttempt.create({ data: {
      id: 'attempt-aaaaaaaaaaaaaaaaaaaaaaaa', turnId: 'v14-turn-public', agentRevisionId: 'v14-revision',
      runId: 'v14-public-run', state: 'pending',
    } });
    await db.conversationMessage.create({ data: {
      id: publicMessageId, turnId: 'v14-turn-public', attemptId: 'attempt-aaaaaaaaaaaaaaaaaaaaaaaa',
      role: 'assistant', body: '尚未完成', delivery: 'partial',
    } });

    const basePath = `${baseUrl}/assistant/conversations/post-detail/post-a/stop`;
    const request = (ownerCookie: string, messageId: string, origin?: string) => fetch(basePath, {
      method: 'POST',
      headers: { cookie: `walker-anon=${ownerCookie}`, 'content-type': 'application/json', ...(origin ? { origin } : {}) },
      body: JSON.stringify({ messageId }),
    });
    const crossOrigin = await request(cookie, publicMessageId, 'https://attacker.example');
    expect(crossOrigin.status).toBe(403);
    expect(await db.executionRun.findUnique({ where: { id: 'v14-public-run' } })).toMatchObject({ state: 'QUEUED' });
    const otherVisitor = await request('f'.repeat(64), publicMessageId);
    expect(otherVisitor.status).toBe(404);
    expect(await db.executionRun.findUnique({ where: { id: 'v14-public-run' } })).toMatchObject({ state: 'QUEUED' });

    const stopped = await request(cookie, publicMessageId);
    expect(stopped.status).toBe(201);
    expect(await stopped.json()).toMatchObject({ state: 'CANCELLED', confirmed: true });
    expect(await db.executionRun.findUnique({ where: { id: 'v14-public-run' } })).toMatchObject({ state: 'CANCELLED', stopReason: 'user' });

    await db.conversationTurn.create({ data: {
      id: 'v14-turn-admin', conversationId, seq: 2, requestKey: 'v14-admin-key',
    } });
    await db.executionRun.create({ data: {
      id: 'v14-admin-run', kind: 'chat', origin: 'admin', actor: 'owner', actorScope: 'admin:owner',
      requestKey: 'v14-admin-key', inputHash: 'c'.repeat(64), state: 'QUEUED',
    } });
    const adminMessageId = 'message-bbbbbbbbbbbbbbbbbbbbbbbb';
    await db.conversationAttempt.create({ data: {
      id: 'attempt-bbbbbbbbbbbbbbbbbbbbbbbb', turnId: 'v14-turn-admin', agentRevisionId: 'admin-revision',
      runId: 'v14-admin-run', state: 'pending',
    } });
    await db.conversationMessage.create({ data: {
      id: adminMessageId, turnId: 'v14-turn-admin', attemptId: 'attempt-bbbbbbbbbbbbbbbbbbbbbbbb',
      role: 'assistant', body: '后台回答', delivery: 'partial',
    } });
    const adminResponse = await request(cookie, adminMessageId);
    expect(adminResponse.status).toBe(404);
    expect(await db.executionRun.findUnique({ where: { id: 'v14-admin-run' } })).toMatchObject({ state: 'QUEUED' });
  });

  it('records only whitelisted assistant panel events, deduplicates eventId, and uses server receive time', async () => {
    const body = {
      schemaVersion: 1, eventId: 'v15-event-open-0001', event: 'open',
      placementKey: 'post-detail', scopeSlug: 'post-a', occurredAt: '2001-01-01T00:00:00.000Z',
    };
    const request = (payload: unknown) => fetch(`${baseUrl}/assistant/events`, {
      method: 'POST',
      headers: { cookie: `walker-anon=${'g'.repeat(64)}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const first = await request(body);
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ recorded: true, duplicate: false });
    const duplicate = await request(body);
    expect(duplicate.status).toBe(201);
    expect(await duplicate.json()).toEqual({ recorded: false, duplicate: true });
    const event = await db.featureEvent.findUniqueOrThrow({ where: { eventId: body.eventId } });
    expect(event).toMatchObject({
      featureKey: 'assistant.interaction', event: 'open', actorType: 'visitor',
      conversationId: null, props: { placementKey: 'post-detail', scopeSlug: 'post-a', clientOccurredAt: body.occurredAt },
    });
    expect(event.receivedAt.getFullYear()).toBeGreaterThan(2020);

    const crossOrigin = await fetch(`${baseUrl}/assistant/events`, {
      method: 'POST',
      headers: { cookie: `walker-anon=${'g'.repeat(64)}`, origin: 'https://attacker.example', 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, eventId: 'v15-event-cross-0001' }),
    });
    expect(crossOrigin.status).toBe(403);
    expect(await db.featureEvent.findUnique({ where: { eventId: 'v15-event-cross-0001' } })).toBeNull();

    const injected = await request({ ...body, eventId: 'v15-event-inject-0001', url: 'https://attacker.example' });
    expect(injected.status).toBe(400);
    expect(await db.featureEvent.findUnique({ where: { eventId: 'v15-event-inject-0001' } })).toBeNull();
  });
});
