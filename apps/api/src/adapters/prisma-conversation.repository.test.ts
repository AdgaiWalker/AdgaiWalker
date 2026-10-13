import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaPort } from '../ports/prisma.port';
import { PrismaConversationRepository } from './prisma-conversation.repository';

const CONV = 'v07-conv';
const TOMBSTONE_CONV = 'v18-tombstone-conv';

let db: PrismaClient;
let repo: PrismaConversationRepository;

beforeAll(async () => {
  db = new PrismaClient();
  repo = new PrismaConversationRepository({ getClient: () => db } as PrismaPort);
  await repo.create({ id: CONV, anonId: 'anon-v07', placementKey: 'post-detail', scopeSlug: 'a-post' });
});

afterAll(async () => {
  await db?.conversationLogResource.deleteMany({ where: { conversationId: CONV } });
  await db?.conversationLogResource.deleteMany({ where: { conversationId: TOMBSTONE_CONV } });
  await db?.deletionTombstone.deleteMany({ where: { conversationId: TOMBSTONE_CONV } });
  const conversationIds = [CONV, TOMBSTONE_CONV];
  await db?.conversationMessage.deleteMany({ where: { turn: { conversationId: { in: conversationIds } } } });
  await db?.conversationAttempt.deleteMany({ where: { turn: { conversationId: { in: conversationIds } } } });
  await db?.conversationTurn.deleteMany({ where: { conversationId: { in: conversationIds } } });
  await db?.conversationSdkSession.deleteMany({ where: { conversationId: { in: conversationIds } } });
  await db?.featureEvent.deleteMany({ where: { conversationId: { in: conversationIds } } });
  await db?.conversation.deleteMany({ where: { id: { in: conversationIds } } });
  await db?.$disconnect();
});

describe('PrismaConversationRepository（V07 业务会话）', () => {
  it('重复 requestKey 不产生重复行，返回同一轮次；seq 单调递增', async () => {
    const first = await repo.addVisitorMessage({ conversationId: CONV, turnId: 'v07-turn-1', messageId: 'v07-msg-1', requestKey: 'rk-1', body: '问题一' });
    expect(first.seq).toBe(1);
    expect(first.messages[0]?.delivery).toBe('ack');
    expect(await db.conversationLogResource.findUnique({
      where: { resourceType_resourceKey: { resourceType: 'message', resourceKey: 'v07-msg-1' } },
    })).toMatchObject({ conversationId: CONV, parentKey: 'v07-turn-1' });

    const again = await repo.addVisitorMessage({ conversationId: CONV, turnId: 'v07-turn-dup', messageId: 'v07-msg-dup', requestKey: 'rk-1', body: '问题一' });
    expect(again.id).toBe(first.id);
    expect(await db.conversationTurn.count({ where: { conversationId: CONV } })).toBe(1);
    expect(await db.conversationMessage.count({ where: { turn: { conversationId: CONV } } })).toBe(1);

    const second = await repo.addVisitorMessage({ conversationId: CONV, turnId: 'v07-turn-2', messageId: 'v07-msg-2', requestKey: 'rk-2', body: '问题二' });
    expect(second.seq).toBe(2);
  });

  it('重新生成单列 attempt，互不覆盖；runId 可关联统一执行', async () => {
    const attempt1 = await repo.addAttempt({ id: 'v07-att-1', turnId: 'v07-turn-1', agentRevisionId: 'rev-a', runId: 'run-1' });
    const attempt2 = await repo.addAttempt({ id: 'v07-att-2', turnId: 'v07-turn-1', agentRevisionId: 'rev-a', runId: 'run-2' });
    expect(attempt1.id).not.toBe(attempt2.id);
    expect(await db.conversationAttempt.count({ where: { turnId: 'v07-turn-1' } })).toBe(2);

    await repo.setAttemptState(attempt1.id, 'cancelled');
    const detail = await repo.detail(CONV);
    const turn = detail?.turns.find((item) => item.id === 'v07-turn-1');
    expect(turn?.attempts.map((item) => item.state)).toEqual(['cancelled', 'pending']);
  });

  it('回答消息挂在 attempt 上，投递状态可推进；生成成功不等于交付成功', async () => {
    const message = await repo.addAssistantMessage({ id: 'v07-msg-a1', turnId: 'v07-turn-1', attemptId: 'v07-att-2', body: '回答一' });
    expect(message.turnId).toBe('v07-turn-1');
    expect(message.delivery).toBe('pending');
    expect(await db.conversationLogResource.findUnique({
      where: { resourceType_resourceKey: { resourceType: 'message', resourceKey: message.id } },
    })).toMatchObject({ conversationId: CONV, parentKey: 'v07-turn-1' });

    await repo.setDelivery(message.id, 'sent');
    await repo.setDelivery(message.id, 'ack');
    const detail = await repo.detail(CONV);
    const assistant = detail?.turns[0]?.messages.find((item) => item.id === message.id);
    expect(assistant?.delivery).toBe('ack');

    await repo.setDelivery(message.id, 'unknown');
    const unknown = await db.conversationMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(unknown.delivery).toBe('unknown');
  });

  it('切换 Agent：同一业务会话不同成员各有独立 SDK session 关联', async () => {
    await repo.linkSdkSession({ id: 'v07-sdk-1', conversationId: CONV, agentRevisionId: 'rev-a', sdkSessionId: 'sdk-session-a' });
    await repo.linkSdkSession({ id: 'v07-sdk-2', conversationId: CONV, agentRevisionId: 'rev-b', sdkSessionId: 'sdk-session-b' });
    expect(await repo.sdkSessionFor(CONV, 'rev-a')).toBe('sdk-session-a');
    expect(await repo.sdkSessionFor(CONV, 'rev-b')).toBe('sdk-session-b');
    expect(await db.conversationSdkSession.count({ where: { conversationId: CONV } })).toBe(2);
    expect(await db.conversationLogResource.count({ where: { conversationId: CONV, resourceType: 'native-session' } })).toBe(2);

    const detail = await repo.detail(CONV);
    expect(detail?.sdkSessions).toHaveLength(2);
  });

  it('重复 eventId 不产生重复行；接收时间由服务端写', async () => {
    const first = await repo.recordEvent({ id: 'v07-evt-1', eventId: 'v07-evt-open-1', featureKey: 'assistant-panel', event: 'open', actorType: 'visitor', conversationId: CONV });
    expect(first).toBe('recorded');
    const dup = await repo.recordEvent({ id: 'v07-evt-2', eventId: 'v07-evt-open-1', featureKey: 'assistant-panel', event: 'open', actorType: 'visitor', conversationId: CONV });
    expect(dup).toBe('duplicate');
    expect(await db.featureEvent.count({ where: { eventId: 'v07-evt-open-1' } })).toBe(1);

    const row = await db.featureEvent.findFirstOrThrow({ where: { eventId: 'v07-evt-open-1' } });
    expect(row.receivedAt.getTime()).toBeGreaterThan(0);
    expect(await db.conversationLogResource.findUnique({
      where: { resourceType_resourceKey: { resourceType: 'event', resourceKey: row.id } },
    })).toMatchObject({ conversationId: CONV });
  });

  it('partial/sent/ack 状态分开；重复 ACK 不新增事件且不能跨访客确认', async () => {
    const message = await repo.addAssistantMessage({ id: 'v07-msg-ack', turnId: 'v07-turn-1', attemptId: 'v07-att-2', body: '部分回答' });
    await repo.setAssistantMessage({ id: message.id, body: '部分回答', delivery: 'partial' });
    expect((await repo.detail(CONV))?.turns[0]?.messages.find((item) => item.id === message.id)?.delivery).toBe('partial');
    await repo.setAssistantMessage({ id: message.id, body: '完整回答', delivery: 'sent' });

    expect(await repo.acknowledgeMessage(message.id, 'anon-v07')).toBe('acked');
    expect(await repo.acknowledgeMessage(message.id, 'anon-v07')).toBe('duplicate');
    expect(await repo.acknowledgeMessage(message.id, 'someone-else')).toBe('not-found');
    expect(await db.featureEvent.count({ where: { eventId: `assistant-ack:anon-v07:${message.id}` } })).toBe(1);
    expect(await db.conversationLogResource.count({
      where: { conversationId: CONV, resourceType: 'event', resourceKey: `${message.id}-ack` },
    })).toBe(1);

    const uncertain = await repo.addAssistantMessage({ id: 'v07-msg-unknown', turnId: 'v07-turn-1', attemptId: 'v07-att-2', body: '' });
    expect(await repo.setAssistantDeliveryForVisitor(uncertain.id, 'anon-v07', 'unknown')).toBe(true);
    expect(await db.conversationMessage.findUniqueOrThrow({ where: { id: uncertain.id } })).toMatchObject({ delivery: 'unknown' });
  });

  it('tombstone blocks late body updates and new turns without changing the stored message', async () => {
    await repo.create({ id: TOMBSTONE_CONV, anonId: 'anon-deleted', placementKey: 'post-detail', scopeSlug: 'deleted-post' });
    const turn = await repo.addVisitorMessage({
      conversationId: TOMBSTONE_CONV, turnId: 'v18-tombstone-turn', messageId: 'v18-tombstone-visitor',
      requestKey: 'v18-tombstone-rk', body: '原始回答上下文',
    });
    await repo.addAttempt({ id: 'v18-tombstone-attempt', turnId: turn.id, agentRevisionId: 'revision', runId: null });
    await repo.addAssistantMessage({ id: 'v18-tombstone-assistant', turnId: turn.id, attemptId: 'v18-tombstone-attempt', body: '待删除的回答' });
    await db.deletionTombstone.create({ data: { conversationId: TOMBSTONE_CONV } });

    await expect(repo.setAssistantMessage({ id: 'v18-tombstone-assistant', body: '迟到的新正文', delivery: 'sent' }))
      .rejects.toMatchObject({ response: { code: 'conversation-deleted' } });
    await expect(repo.addVisitorMessage({
      conversationId: TOMBSTONE_CONV, turnId: 'v18-late-turn', messageId: 'v18-late-message',
      requestKey: 'v18-late-rk', body: '不得新增',
    })).rejects.toThrow('conversation-deletion-pending');
    expect(await db.conversationMessage.findUniqueOrThrow({ where: { id: 'v18-tombstone-assistant' } }).then((row) => row.body))
      .toBe('待删除的回答');
    expect(await repo.isDeleted(TOMBSTONE_CONV)).toBe(true);
  });
});
