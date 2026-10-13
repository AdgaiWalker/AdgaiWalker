import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaConversationQueryRepository } from './prisma-conversation-query.repository';
import type { PrismaPort } from '../ports/prisma.port';

const prefix = `v20-query-${randomUUID().replaceAll('-', '')}`;
const agentId = `${prefix}-agent`;
const revisionId = `${prefix}-revision`;
const visibleConversation = `${prefix}-visible`;
const asOfConversation = `${prefix}-asof`;
const deletedConversation = `${prefix}-deleted`;
const expiredConversation = `${prefix}-expired`;
const ownerHash = `${prefix}-owner`;
const runZero = `run_${prefix}-zero`;
const runUnknown = `run_${prefix}-unknown`;
const pageConversations = Array.from({ length: 51 }, (_, index) => `${prefix}-page-${String(index).padStart(2, '0')}`);
const retentionCutoff = new Date('2026-06-27T00:00:00.000Z');
let db: PrismaClient;
let repository: PrismaConversationQueryRepository;

beforeAll(async () => {
  db = new PrismaClient();
  repository = new PrismaConversationQueryRepository({ getClient: () => db } as PrismaPort);
  await db.agentUnit.create({ data: { id: agentId, name: '访客助理测试', prompt: 'unused' } });
  await db.agentRevision.create({
    data: { id: revisionId, agentId, version: 7, prompt: 'unused', modelId: 'test-model', toolProfile: {}, schemaVersion: 1, configHash: `${prefix}-config` },
  });
  // 固定时间戳：该会话会被 2026-09-25 的日期窗口过滤，用默认 now() 会在跨天后掉出窗口
  await db.conversation.create({
    data: {
      id: visibleConversation, anonId: ownerHash, placementKey: 'post-detail', scopeSlug: 'post-a',
      createdAt: new Date('2026-09-25T00:00:00.000Z'), updatedAt: new Date('2026-09-25T00:00:00.000Z'),
    },
  });
  const firstTurn = await db.conversationTurn.create({
    data: { id: `${prefix}-turn-zero`, conversationId: visibleConversation, seq: 1, requestKey: `${prefix}-request-zero` },
  });
  await db.conversationMessage.createMany({ data: [
    { id: `${prefix}-visitor-zero`, turnId: firstTurn.id, role: 'visitor', body: '退款到账需要多久？', delivery: 'ack' },
    { id: `${prefix}-assistant-zero`, turnId: firstTurn.id, role: 'assistant', body: '一般需要三个工作日。', delivery: 'ack' },
  ] });
  await db.conversationAttempt.create({
    data: { id: `${prefix}-attempt-zero`, turnId: firstTurn.id, agentRevisionId: revisionId, runId: runZero, state: 'generated' },
  });
  await db.executionRun.create({
    data: {
      id: runZero, kind: 'chat', origin: 'public', actor: ownerHash, actorScope: `public:${ownerHash}`,
      agentRevisionId: revisionId, placementKey: 'post-detail', requestKey: `${prefix}-execution-zero`, inputHash: 'a'.repeat(64),
      state: 'FAILED', tokensIn: 0, tokensOut: 0,
    },
  });
  await db.executionEvent.create({
    data: { id: `${prefix}-event-zero`, runId: runZero, seq: 1, kind: 'text', text: '一般需要三个工作日。' },
  });
  await db.assistantRun.create({
    data: {
      id: `${prefix}-assistant-run-zero`, sessionId: `${prefix}-session`, question: '退款到账需要多久？', answer: '一般需要三个工作日。',
      citations: JSON.stringify([{ slug: 'post-a' }]), aiUsedFlag: true, elapsedMs: 123, anonIdHash: ownerHash,
      requestKey: firstTurn.requestKey,
    },
  });

  const secondTurn = await db.conversationTurn.create({
    data: { id: `${prefix}-turn-unknown`, conversationId: visibleConversation, seq: 2, requestKey: `${prefix}-request-unknown` },
  });
  await db.conversationMessage.create({
    data: { id: `${prefix}-visitor-unknown`, turnId: secondTurn.id, role: 'visitor', body: '那退款失败怎么办？', delivery: 'ack' },
  });
  await db.conversationMessage.create({
    data: { id: `${prefix}-assistant-unknown`, turnId: secondTurn.id, role: 'assistant', body: '第二轮最新回答正文', delivery: 'ack' },
  });
  await db.conversationAttempt.create({
    data: { id: `${prefix}-attempt-unknown`, turnId: secondTurn.id, agentRevisionId: revisionId, runId: runUnknown, state: 'failed' },
  });
  await db.executionRun.create({
    data: {
      id: runUnknown, kind: 'chat', origin: 'public', actor: ownerHash, actorScope: `public:${ownerHash}`,
      agentRevisionId: revisionId, placementKey: 'post-detail', requestKey: `${prefix}-execution-unknown`, inputHash: 'b'.repeat(64), state: 'FAILED',
    },
  });

  await db.conversation.create({
    data: { id: deletedConversation, anonId: `${ownerHash}-deleted`, placementKey: 'post-detail', scopeSlug: 'post-a' },
  });
  const deletedTurn = await db.conversationTurn.create({
    data: { id: `${prefix}-turn-deleted`, conversationId: deletedConversation, seq: 1, requestKey: `${prefix}-deleted-key` },
  });
  await db.conversationMessage.create({
    data: { id: `${prefix}-message-deleted`, turnId: deletedTurn.id, role: 'visitor', body: '此正文已申请删除', delivery: 'ack' },
  });
  await db.deletionTombstone.create({ data: { conversationId: deletedConversation, state: 'pending' } });
  await db.conversation.create({
    data: {
      id: expiredConversation, anonId: `${ownerHash}-expired`, placementKey: 'post-detail', scopeSlug: 'expired-post',
      createdAt: new Date('2026-06-01T00:00:00.000Z'), updatedAt: new Date('2026-09-25T00:00:00.000Z'),
    },
  });
  const expiredTurn = await db.conversationTurn.create({
    data: { id: `${prefix}-turn-expired`, conversationId: expiredConversation, seq: 1, requestKey: `${prefix}-expired-key` },
  });
  await db.conversationMessage.create({
    data: { id: `${prefix}-message-expired`, turnId: expiredTurn.id, role: 'visitor', body: '超期会话正文', delivery: 'ack' },
  });
  await db.conversation.createMany({
    data: pageConversations.map((id, index) => ({
      id, anonId: `${ownerHash}-${index}`, placementKey: 'post-detail', scopeSlug: 'pagination',
      createdAt: new Date(Date.UTC(2026, 8, 25, 0, 0, index)), updatedAt: new Date(Date.UTC(2026, 8, 25, 0, 0, index)),
    })),
  });
}, 30_000);

afterAll(async () => {
  const conversationIds = [visibleConversation, asOfConversation, deletedConversation, expiredConversation, ...pageConversations];
  const runIds = [runZero, runUnknown];
  await db?.featureEvent.deleteMany({ where: { conversationId: { in: conversationIds } } });
  await db?.assistantRun.deleteMany({ where: { id: `${prefix}-assistant-run-zero` } });
  await db?.executionEvent.deleteMany({ where: { runId: { in: runIds } } });
  await db?.conversationLogResource.deleteMany({ where: { conversationId: { in: conversationIds } } });
  await db?.deletionTombstone.deleteMany({ where: { conversationId: deletedConversation } });
  await db?.conversation.deleteMany({ where: { id: { in: conversationIds } } });
  await db?.executionRun.deleteMany({ where: { id: { in: runIds } } });
  await db?.agentRevision.deleteMany({ where: { id: revisionId } });
  await db?.agentUnit.deleteMany({ where: { id: agentId } });
  await db?.$disconnect();
});

describe('PrismaConversationQueryRepository', () => {
  it('captures the full filtered conversation ID set for a frozen export snapshot', async () => {
    const ids = await repository.snapshotIds({
      limit: 50, cursor: null,
      retentionCutoff, from: new Date('2026-09-25T00:00:00.000Z'), toExclusive: new Date('2026-09-26T00:00:00.000Z'),
      contentSlug: 'post-a', placementKey: 'post-detail', agentId, runState: 'FAILED', keyword: '退款到账',
    }, 10_000);

    expect(ids).toEqual([visibleConversation]);
    expect(ids).not.toContain(deletedConversation);
    expect(ids).not.toContain(expiredConversation);
  });

  it('returns only conversation detail records at or before the frozen snapshot time', async () => {
    const snapshotAt = new Date(Date.now() + 1_000);
    const laterAt = new Date(snapshotAt.getTime() + 5_000);
    const earlierAt = new Date(snapshotAt.getTime() - 5_000);
    await db.conversation.create({ data: {
      id: asOfConversation, anonId: `${ownerHash}-asof`, placementKey: 'post-detail', scopeSlug: 'snapshot-post',
      createdAt: earlierAt, updatedAt: laterAt,
    } });
    await db.conversationTurn.create({ data: {
      id: `${prefix}-turn-before-snapshot`, conversationId: asOfConversation, seq: 1,
      requestKey: `${prefix}-before-snapshot`, createdAt: earlierAt,
    } });
    await db.conversationMessage.create({ data: {
      id: `${prefix}-message-before-snapshot`, turnId: `${prefix}-turn-before-snapshot`, role: 'visitor',
      body: '快照之前的问题', delivery: 'ack', createdAt: earlierAt,
    } });
    await db.conversationTurn.create({ data: {
      id: `${prefix}-turn-after-snapshot`, conversationId: asOfConversation, seq: 2,
      requestKey: `${prefix}-after-snapshot`, createdAt: laterAt,
    } });
    await db.conversationMessage.create({ data: {
      id: `${prefix}-message-after-snapshot`, turnId: `${prefix}-turn-after-snapshot`, role: 'visitor',
      body: '快照之后的新问题', delivery: 'ack', createdAt: laterAt,
    } });

    const detail = await repository.detail(asOfConversation, new Date(0), snapshotAt);

    expect(detail?.turns).toHaveLength(1);
    expect(JSON.stringify(detail)).toContain('快照之前的问题');
    expect(JSON.stringify(detail)).not.toContain('快照之后的新问题');
  });

  it('filters by content, placement, Agent, date, run state, and keyword while excluding tombstones', async () => {
    const page = await repository.list({
      limit: 50, cursor: null,
      retentionCutoff, from: new Date('2026-09-25T00:00:00.000Z'), toExclusive: new Date('2026-09-26T00:00:00.000Z'),
      contentSlug: 'post-a', placementKey: 'post-detail', agentId, runState: 'FAILED', keyword: '退款到账',
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      conversationId: visibleConversation, contentSlug: 'post-a', placementKey: 'post-detail', turnCount: 2,
      latestQuestion: '那退款失败怎么办？', latestRunState: 'FAILED',
      participants: [{ agentId, agentName: '访客助理测试', revision: 7 }],
    });
    expect(JSON.stringify(page)).not.toContain('第二轮最新回答正文');
    expect(JSON.stringify(page)).not.toContain('此正文已申请删除');
  });

  it('returns detail without collapsing unknown token usage into zero', async () => {
    const detail = await repository.detail(visibleConversation, retentionCutoff);
    expect(detail?.turns.flatMap((turn) => turn.attempts).map((attempt) => attempt.run?.tokensIn)).toEqual([0, null]);
    expect(detail?.turns[0]?.messages.find((message) => message.role === 'assistant')).toMatchObject({
      role: 'assistant', citations: ['post-a'], aiUsedFlag: true,
    });
  });

  it('uses a stable 50/100 cursor boundary and never pages past tombstoned conversations', async () => {
    const first = await repository.list({
      limit: 50, cursor: null, retentionCutoff, from: null, toExclusive: null, contentSlug: 'pagination',
      placementKey: null, agentId: null, runState: 'NONE', keyword: null,
    });
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(first.nextCursor!, 'base64url').toString('utf8')) as { updatedAt: string; id: string };
    const second = await repository.list({
      limit: 100, cursor: { updatedAt: new Date(decoded.updatedAt), id: decoded.id }, retentionCutoff, from: null, toExclusive: null,
      contentSlug: 'pagination', placementKey: null, agentId: null, runState: 'NONE', keyword: null,
    });
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((item) => item.conversationId)).size).toBe(51);
  });

  it('returns no detail for a tombstoned conversation', async () => {
    await expect(repository.detail(deletedConversation, retentionCutoff)).resolves.toBeNull();
  });

  it('does not return details or list entries older than the current detail-retention cutoff', async () => {
    const page = await repository.list({
      limit: 50, cursor: null, retentionCutoff, from: null, toExclusive: null, contentSlug: 'expired-post',
      placementKey: null, agentId: null, runState: null, keyword: null,
    });
    expect(page.items).toEqual([]);
    expect(JSON.stringify(page)).not.toContain('超期会话正文');
    await expect(repository.detail(expiredConversation, retentionCutoff)).resolves.toBeNull();
  });
});
