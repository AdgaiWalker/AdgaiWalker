import { Inject, Injectable } from '@nestjs/common';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { storageUnavailable } from '../common/http-error';
import { newId } from '../common/ids';
import type { ConversationActionCommitPort } from '../ports/conversation-action-commit.port';

const CONVERSION_AUDIT = { targetType: 'action', action: 'conversation.convert' } as const;

@Injectable()
export class PrismaConversationActionCommit implements ConversationActionCommitPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const client = this.prisma.getClient();
    if (!client) throw storageUnavailable();
    return client;
  }

  async findByRequestKey(requestKey: string): Promise<string | null> {
    const audit = await this.db().auditRecord.findFirst({
      where: { ...CONVERSION_AUDIT, requestId: requestKey },
      orderBy: { createdAt: 'asc' },
      select: { targetId: true },
    });
    return audit?.targetId ?? null;
  }

  async commit(input: { action: Parameters<ConversationActionCommitPort['commit']>[0]['action']; requestKey: string; actor: string }) {
    const db = this.db();
    try {
      return await db.$transaction(async (tx) => {
        const prior = await tx.auditRecord.findFirst({
          where: { ...CONVERSION_AUDIT, requestId: input.requestKey },
          orderBy: { createdAt: 'asc' },
          select: { targetId: true },
        });
        if (prior) return { actionId: prior.targetId, replayed: true };

        const { evidenceRef, ...rest } = input.action;
        const action = await tx.action.create({
          data: {
            ...rest,
            ...(evidenceRef ? { evidenceRef } : {}),
            status: 'OPEN',
            completedAt: null,
          },
          select: { id: true },
        });
        await tx.auditRecord.create({
          data: {
            id: newId(), actor: input.actor,
            ...CONVERSION_AUDIT, targetId: action.id, outcome: 'converted',
            beforeHash: null, afterHash: null, requestId: input.requestKey,
          },
        });
        return { actionId: action.id, replayed: false };
      });
    } catch (error) {
      // A concurrent transaction may have committed this key first. Never
      // turn another failure into success unless its committed audit is visible.
      const priorId = await this.findByRequestKey(input.requestKey).catch(() => null);
      if (priorId) return { actionId: priorId, replayed: true };
      throw error;
    }
  }
}
