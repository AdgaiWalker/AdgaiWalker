import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ConversationAttemptView,
  ConversationDetailView,
  ConversationMessageView,
  ConversationTurnView,
  ConversationView,
  MessageDelivery,
} from '@walker/shared';
import { ApiError, storageUnavailable } from '../common/http-error';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import type { ConversationRepositoryPort } from '../ports/conversation.repository';
import { registerLogResource } from './log-resource.writer';

const TURN_INCLUDE = { messages: { orderBy: { createdAt: 'asc' as const } }, attempts: { orderBy: { createdAt: 'asc' as const } } };

type TurnRow = Prisma.ConversationTurnGetPayload<{ include: typeof TURN_INCLUDE }>;

function messageView(row: Prisma.ConversationMessageGetPayload<object>): ConversationMessageView {
  return {
    id: row.id,
    turnId: row.turnId,
    attemptId: row.attemptId,
    role: row.role as ConversationMessageView['role'],
    body: row.body,
    delivery: row.delivery as MessageDelivery,
    createdAt: row.createdAt.toISOString(),
  };
}

function attemptView(row: Prisma.ConversationAttemptGetPayload<object>): ConversationAttemptView {
  return {
    id: row.id,
    turnId: row.turnId,
    agentRevisionId: row.agentRevisionId,
    runId: row.runId,
    state: row.state,
    createdAt: row.createdAt.toISOString(),
  };
}

function turnView(row: TurnRow): ConversationTurnView {
  return {
    id: row.id,
    conversationId: row.conversationId,
    seq: row.seq,
    requestKey: row.requestKey,
    createdAt: row.createdAt.toISOString(),
    messages: row.messages.map(messageView),
    attempts: row.attempts.map(attemptView),
  };
}

@Injectable()
export class PrismaConversationRepository implements ConversationRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    return db;
  }

  async create(input: { id: string; anonId: string; placementKey: string; scopeSlug: string }): Promise<ConversationView> {
    const row = await this.db().$transaction(async (tx) => {
      const deleted = await tx.deletionTombstone.findUnique({ where: { conversationId: input.id }, select: { id: true } });
      if (deleted) throw new ApiError('conversation-deleted', 410, '会话已删除');
      return tx.conversation.create({ data: input });
    });
    return {
      id: row.id,
      anonId: row.anonId,
      placementKey: row.placementKey,
      scopeSlug: row.scopeSlug,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async isDeleted(id: string): Promise<boolean> {
    return Boolean(await this.db().deletionTombstone.findUnique({ where: { conversationId: id }, select: { id: true } }));
  }

  async detail(id: string): Promise<ConversationDetailView | null> {
    const row = await this.db().conversation.findUnique({
      where: { id },
      include: { turns: { orderBy: { seq: 'asc' }, include: TURN_INCLUDE }, sdkSessions: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      anonId: row.anonId,
      placementKey: row.placementKey,
      scopeSlug: row.scopeSlug,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      turns: row.turns.map(turnView),
      sdkSessions: row.sdkSessions.map((session) => ({ agentRevisionId: session.agentRevisionId, sdkSessionId: session.sdkSessionId })),
    };
  }

  async addVisitorMessage(input: Parameters<ConversationRepositoryPort['addVisitorMessage']>[0]): Promise<ConversationTurnView> {
    return this.db().$transaction(async (tx) => {
      const existing = await tx.conversationTurn.findUnique({
        where: { conversationId_requestKey: { conversationId: input.conversationId, requestKey: input.requestKey } },
        include: TURN_INCLUDE,
      });
      if (existing) return turnView(existing);
      const last = await tx.conversationTurn.findFirst({
        where: { conversationId: input.conversationId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });
      await tx.conversationTurn.create({
        data: { id: input.turnId, conversationId: input.conversationId, seq: (last?.seq ?? 0) + 1, requestKey: input.requestKey },
      });
      const visitorMessage = await tx.conversationMessage.create({
        data: { id: input.messageId, turnId: input.turnId, role: 'visitor', body: input.body, delivery: 'ack' },
      });
      await registerLogResource(tx, {
        conversationId: input.conversationId,
        resourceType: 'message',
        resourceKey: visitorMessage.id,
        parentKey: input.turnId,
        resourceCreatedAt: visitorMessage.createdAt,
      });
      await tx.conversation.update({ where: { id: input.conversationId }, data: { updatedAt: new Date() } });
      const fresh = await tx.conversationTurn.findUniqueOrThrow({ where: { id: input.turnId }, include: TURN_INCLUDE });
      return turnView(fresh);
    });
  }

  async addAttempt(input: Parameters<ConversationRepositoryPort['addAttempt']>[0]): Promise<ConversationAttemptView> {
    const existing = await this.db().conversationAttempt.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.turnId !== input.turnId || existing.agentRevisionId !== input.agentRevisionId) {
        throw new ApiError('attempt-id-conflict', 409, '生成尝试 ID 已用于其他消息');
      }
      return attemptView(existing);
    }
    const row = await this.db().conversationAttempt.create({ data: input });
    return attemptView(row);
  }

  async setAttemptRunId(id: string, runId: string): Promise<void> {
    await this.db().conversationAttempt.update({ where: { id }, data: { runId } });
  }

  async setAttemptState(id: string, state: string): Promise<void> {
    await this.db().conversationAttempt.update({ where: { id }, data: { state } });
  }

  async addAssistantMessage(input: Parameters<ConversationRepositoryPort['addAssistantMessage']>[0]): Promise<ConversationMessageView> {
    return this.db().$transaction(async (tx) => {
      const existing = await tx.conversationMessage.findUnique({ where: { id: input.id } });
      if (existing) {
        if (existing.turnId !== input.turnId || existing.role !== 'assistant' || existing.attemptId !== input.attemptId) {
          throw new ApiError('message-id-conflict', 409, '助手消息 ID 已用于其他消息');
        }
        return messageView(existing);
      }
      const row = await tx.conversationMessage.create({
        data: { id: input.id, turnId: input.turnId, attemptId: input.attemptId, role: 'assistant', body: input.body, delivery: 'pending' },
      });
      const owner = await tx.conversationTurn.findUniqueOrThrow({ where: { id: input.turnId }, select: { conversationId: true } });
      await registerLogResource(tx, {
        conversationId: owner.conversationId,
        resourceType: 'message',
        resourceKey: row.id,
        parentKey: input.turnId,
        resourceCreatedAt: row.createdAt,
      });
      return messageView(row);
    });
  }

  async setAssistantMessage(input: Parameters<ConversationRepositoryPort['setAssistantMessage']>[0]): Promise<void> {
    await this.db().$transaction(async (tx) => {
      const message = await tx.conversationMessage.findUnique({
        where: { id: input.id }, select: { turn: { select: { conversationId: true } } },
      });
      if (!message) throw new ApiError('assistant-message-not-found', 404, '找不到助手消息');
      const tombstone = await tx.deletionTombstone.findUnique({
        where: { conversationId: message.turn.conversationId }, select: { id: true },
      });
      if (tombstone) throw new ApiError('conversation-deleted', 410, '会话已删除');
      const changed = await tx.conversationMessage.updateMany({
        where: { id: input.id, role: 'assistant', delivery: { in: ['pending', 'partial', 'unknown'] } },
        data: {
          body: input.body,
          delivery: input.delivery,
          ...(input.attemptId === undefined ? {} : { attemptId: input.attemptId }),
        },
      });
      if (changed.count === 1) return;
      const existing = await tx.conversationMessage.findUnique({ where: { id: input.id }, select: { role: true, delivery: true } });
      if (existing?.role === 'assistant' && (existing.delivery === 'sent' || existing.delivery === 'ack')) return;
      throw new ApiError('assistant-message-not-found', 404, '找不到助手消息');
    });
  }

  async setDelivery(messageId: string, delivery: MessageDelivery): Promise<void> {
    await this.db().conversationMessage.update({ where: { id: messageId }, data: { delivery } });
  }

  async setAssistantDeliveryForVisitor(
    messageId: string,
    anonId: string,
    delivery: 'sent' | 'unknown',
  ): Promise<boolean> {
    const current = await this.db().conversationMessage.findFirst({
      where: { id: messageId, role: 'assistant', turn: { conversation: { anonId } } },
      select: { delivery: true },
    });
    if (!current) return false;
    if (current.delivery === delivery || current.delivery === 'ack') return true;
    const allowed = delivery === 'sent' ? ['pending'] : ['pending', 'partial'];
    const changed = await this.db().conversationMessage.updateMany({
      where: { id: messageId, role: 'assistant', delivery: { in: allowed }, turn: { conversation: { anonId } } },
      data: { delivery },
    });
    return changed.count === 1;
  }

  async acknowledgeMessage(messageId: string, anonId: string): Promise<'acked' | 'duplicate' | 'not-found' | 'not-sent'> {
    return this.db().$transaction(async (tx) => {
      const message = await tx.conversationMessage.findFirst({
        where: { id: messageId, role: 'assistant', turn: { conversation: { anonId } } },
        include: { turn: { select: { conversationId: true } } },
      });
      if (!message) return 'not-found';
      if (message.delivery === 'ack') return 'duplicate';
      if (message.delivery !== 'sent') return 'not-sent';
      const changed = await tx.conversationMessage.updateMany({
        where: { id: messageId, role: 'assistant', delivery: 'sent' },
        data: { delivery: 'ack' },
      });
      if (changed.count !== 1) return 'duplicate';
      try {
        const event = await tx.featureEvent.create({
          data: {
            id: `${messageId}-ack`,
            eventId: `assistant-ack:${anonId}:${messageId}`,
            featureKey: 'assistant.delivery',
            event: 'ack',
            actorType: 'visitor',
            conversationId: message.turn.conversationId,
            props: Prisma.JsonNull,
          },
        });
        await registerLogResource(tx, {
          conversationId: message.turn.conversationId,
          resourceType: 'event',
          resourceKey: event.id,
          resourceCreatedAt: event.receivedAt,
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      }
      return 'acked';
    });
  }

  async linkSdkSession(input: Parameters<ConversationRepositoryPort['linkSdkSession']>[0]): Promise<void> {
    await this.db().$transaction(async (tx) => {
      await tx.conversationSdkSession.upsert({
        where: { conversationId_agentRevisionId: { conversationId: input.conversationId, agentRevisionId: input.agentRevisionId } },
        create: input,
        update: { sdkSessionId: input.sdkSessionId },
      });
      await registerLogResource(tx, {
        conversationId: input.conversationId,
        resourceType: 'native-session',
        resourceKey: input.sdkSessionId,
        agentRevisionId: input.agentRevisionId,
      });
    });
  }

  async sdkSessionFor(conversationId: string, agentRevisionId: string): Promise<string | null> {
    const row = await this.db().conversationSdkSession.findUnique({
      where: { conversationId_agentRevisionId: { conversationId, agentRevisionId } },
    });
    return row?.sdkSessionId ?? null;
  }

  async recordEvent(input: Parameters<ConversationRepositoryPort['recordEvent']>[0]): Promise<'recorded' | 'duplicate'> {
    try {
      await this.db().$transaction(async (tx) => {
        const event = await tx.featureEvent.create({
          data: {
            id: input.id,
            eventId: input.eventId,
            featureKey: input.featureKey,
            event: input.event,
            actorType: input.actorType,
            failCode: input.failCode ?? null,
            conversationId: input.conversationId ?? null,
            props: input.props === undefined ? Prisma.JsonNull : (input.props as Prisma.InputJsonValue),
          },
        });
        await registerLogResource(tx, {
          conversationId: event.conversationId ?? null,
          resourceType: 'event',
          resourceKey: event.id,
          resourceCreatedAt: event.receivedAt,
        });
      });
      return 'recorded';
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'duplicate';
      throw error;
    }
  }

}
