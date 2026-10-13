import { Inject, Injectable } from '@nestjs/common';
import {
  PRISMA,
  type PrismaPort,
} from '../ports/prisma.port';
import type {
  AssistantRepositoryPort,
  AssistantRunInput,
  AssistantRunRecord,
  AssistantSessionInput,
} from '../ports/assistant.repository';
import { registerLogResource } from './log-resource.writer';

@Injectable()
export class PrismaAssistantRepository implements AssistantRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    return this.prisma.getClient();
  }

  async upsertSession(input: AssistantSessionInput): Promise<void> {
    const client = this.db();
    if (!client) return;
    const { conversationId, ...session } = input;
    if (!conversationId) {
      await client.assistantSession.upsert({
        where: { anonId_sessionId: { anonId: session.anonId, sessionId: session.sessionId } },
        create: session,
        update: { lastActiveAt: new Date() },
      });
      return;
    }
    await client.$transaction(async (tx) => {
      if (await tx.deletionTombstone.findUnique({ where: { conversationId }, select: { id: true } })) {
        throw new Error('conversation-deletion-pending');
      }
      await tx.assistantSession.upsert({
        where: { anonId_sessionId: { anonId: session.anonId, sessionId: session.sessionId } },
        create: session,
        update: { lastActiveAt: new Date() },
      });
    });
  }

  async findSession(sessionId: string): Promise<{ anonId: string; runner: string; agentRevisionId: string | null } | null> {
    const row = await this.db()?.assistantSession.findFirst({ where: { sessionId } });
    return row ? { anonId: row.anonId, runner: row.runner, agentRevisionId: row.agentRevisionId } : null;
  }

  async saveRun(input: AssistantRunInput): Promise<void> {
    const client = this.db();
    if (!client) return;
    const { conversationId, ...runInput } = input;
    await client.$transaction(async (tx) => {
      const run = await tx.assistantRun.create({ data: runInput });
      await registerLogResource(tx, {
        conversationId: conversationId ?? null,
        resourceType: 'assistant-run',
        resourceKey: run.id,
        parentKey: run.sessionId,
        resourceCreatedAt: run.createdAt,
      });
    });
  }

  async listRuns(limit: number): Promise<AssistantRunRecord[]> {
    const client = this.db();
    if (!client) return [];
    const rows = await client.assistantRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map((row) => this.toRecord(row));
  }

  async findRunByRequest(anonIdHash: string, requestKey: string): Promise<AssistantRunRecord | null> {
    const client = this.db();
    if (!client) return null;
    const row = await client.assistantRun.findUnique({
      where: { anonIdHash_requestKey: { anonIdHash, requestKey } },
    });
    return row ? this.toRecord(row) : null;
  }

  private toRecord(row: {
    id: string; sessionId: string; question: string; answer: string; citations: string;
    aiUsedFlag: boolean; elapsedMs: number; source: string; createdAt: Date;
  }): AssistantRunRecord {
    return {
      id: row.id,
      sessionId: row.sessionId,
      question: row.question,
      answer: row.answer,
      citations: JSON.parse(row.citations) as string[],
      aiUsedFlag: row.aiUsedFlag,
      elapsedMs: row.elapsedMs,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async bumpRequests(
    date: string,
    usage?: { tokensIn: number; tokensOut: number },
  ): Promise<number> {
    const client = this.db();
    if (!client) return 0;
    const tokensIn = usage?.tokensIn ?? 0;
    const tokensOut = usage?.tokensOut ?? 0;
    const row = await client.assistantBudget.upsert({
      where: { date },
      create: { date, requests: 1, tokensIn, tokensOut },
      update: usage
        ? {
            requests: { increment: 1 },
            tokensIn: { increment: tokensIn },
            tokensOut: { increment: tokensOut },
          }
        : { requests: { increment: 1 } },
    });
    return row.requests;
  }

  async addTokens(
    date: string,
    usage: { tokensIn: number; tokensOut: number },
  ): Promise<void> {
    const client = this.db();
    if (!client) return;
    await client.assistantBudget.upsert({
      where: { date },
      create: {
        date,
        requests: 0,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
      },
      update: {
        tokensIn: { increment: usage.tokensIn },
        tokensOut: { increment: usage.tokensOut },
      },
    });
  }
}
