import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { isRunTerminal, type RunState } from '@walker/shared';
import { storageUnavailable } from '../common/http-error';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import type { ConversationDeletionRepositoryPort, DeletionConversation } from '../ports/conversation-deletion.repository';
import type { LogResourceRecord } from '../ports/log-resource.repository';

@Injectable()
export class PrismaConversationDeletionRepository implements ConversationDeletionRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    return db;
  }

  async conversation(id: string): Promise<DeletionConversation | null> {
    const row = await this.db().conversation.findUnique({
      where: { id },
      select: {
        id: true,
        anonId: true,
        placementKey: true,
        scopeSlug: true,
        turns: { select: { attempts: { select: { runId: true } } } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      anonId: row.anonId,
      placementKey: row.placementKey,
      scopeSlug: row.scopeSlug,
      runIds: [...new Set(row.turns.flatMap((turn) => turn.attempts.map((attempt) => attempt.runId).filter((value): value is string => value !== null)))],
    };
  }

  async deleteDatabaseResource(resource: LogResourceRecord): Promise<void> {
    await this.db().$transaction(async (tx) => {
      const registered = await tx.conversationLogResource.findUnique({ where: { id: resource.id } });
      if (!registered) return;
      if (registered.conversationId !== resource.conversationId) throw new Error('log-resource-owner-conflict');
      const tombstone = registered.conversationId
        ? await tx.deletionTombstone.findUnique({ where: { conversationId: registered.conversationId }, select: { id: true } })
        : null;
      if (registered.conversationId && !tombstone) throw new Error('deletion-tombstone-required');
      const owner = registered.conversationId
        ? await tx.conversation.findUnique({ where: { id: registered.conversationId }, select: { id: true, anonId: true } })
        : null;

      switch (resource.resourceType) {
        case 'message':
          await tx.conversationMessage.deleteMany({
            where: { id: resource.resourceKey, turn: { conversationId: registered.conversationId ?? undefined } },
          });
          break;
        case 'event':
          await tx.featureEvent.deleteMany({ where: { id: resource.resourceKey } });
          break;
        case 'assistant-run':
          await tx.assistantRun.deleteMany({
            where: { id: resource.resourceKey, ...(owner ? { anonIdHash: owner.anonId } : {}) },
          });
          break;
        case 'execution-event':
          await tx.executionEvent.deleteMany({ where: { id: resource.resourceKey } });
          break;
        case 'execution-run':
          await this.deleteTerminalRun(tx, resource.resourceKey, owner?.anonId ?? null);
          break;
        case 'native-session':
        case 'native-fork':
          await tx.conversationSdkSession.deleteMany({
            where: { conversationId: registered.conversationId ?? undefined, sdkSessionId: resource.resourceKey },
          });
          await tx.assistantSession.deleteMany({
            where: { sessionId: resource.resourceKey, ...(owner ? { anonId: owner.anonId } : {}) },
          });
          break;
        case 'trace':
        case 'assistant-event-spool':
        case 'export':
        case 'daily-aggregate':
          break;
        default:
          throw new Error('log-resource-type-unsupported');
      }

      if (resource.resourceType === 'execution-run') {
        await tx.conversationLogResource.deleteMany({ where: { resourceType: 'execution-event', parentKey: resource.resourceKey } });
      }
      await tx.conversationLogResource.deleteMany({ where: { id: resource.id } });
    });
  }

  async finalizeConversation(conversationId: string, tombstoneId: string): Promise<void> {
    await this.db().$transaction(async (tx) => {
      const tombstone = await tx.deletionTombstone.findUnique({ where: { id: tombstoneId } });
      if (!tombstone || tombstone.conversationId !== conversationId) throw new Error('deletion-tombstone-not-found');
      if (await tx.conversationLogResource.count({ where: { conversationId } }) > 0) throw new Error('conversation-resources-remain');

      const conversation = await tx.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true, anonId: true, turns: { select: { id: true, requestKey: true, attempts: { select: { runId: true } } } } },
      });
      if (conversation) {
        const runIds = [...new Set(conversation.turns.flatMap((turn) => turn.attempts.map((attempt) => attempt.runId).filter((value): value is string => value !== null)))];
        for (const runId of runIds) await this.deleteTerminalRun(tx, runId, conversation.anonId);
        const sdkSessions = await tx.conversationSdkSession.count({ where: { conversationId } });
        if (sdkSessions > 0) throw new Error('native-session-resource-remains');
        await tx.featureEvent.deleteMany({ where: { conversationId } });
        await tx.assistantRun.deleteMany({
          where: { anonIdHash: conversation.anonId, requestKey: { in: conversation.turns.map((turn) => turn.requestKey) } },
        });
        await tx.conversationMessage.deleteMany({ where: { turn: { conversationId } } });
        await tx.conversationAttempt.deleteMany({ where: { turn: { conversationId } } });
        await tx.conversationTurn.deleteMany({ where: { conversationId } });
        await tx.conversation.delete({ where: { id: conversationId } });
      }
      await tx.deletionTombstone.update({
        where: { id: tombstoneId },
        data: { state: 'completed', lastErrorCode: null, completedAt: new Date() },
      });
    });
  }

  private async deleteTerminalRun(tx: Prisma.TransactionClient, runId: string, ownerAnonId: string | null): Promise<void> {
    const run = await tx.executionRun.findUnique({ where: { id: runId }, select: { id: true, state: true, origin: true, actor: true } });
    if (!run) return;
    if (!isRunTerminal(run.state as RunState)) throw new Error('conversation-run-not-stopped');
    if (ownerAnonId && (run.origin !== 'public' || run.actor !== ownerAnonId)) throw new Error('conversation-run-owner-conflict');
    await tx.executionEvent.deleteMany({ where: { runId } });
    await tx.processRecord.deleteMany({ where: { runId } });
    await tx.executionQuotaHold.deleteMany({ where: { runId } });
    await tx.conversationLogResource.deleteMany({ where: { OR: [
      { resourceType: 'execution-run', resourceKey: runId },
      { resourceType: 'execution-event', parentKey: runId },
    ] } });
    await tx.executionRun.delete({ where: { id: runId } });
  }
}
