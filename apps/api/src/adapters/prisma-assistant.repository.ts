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

@Injectable()
export class PrismaAssistantRepository implements AssistantRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    return this.prisma.getClient();
  }

  async upsertSession(input: AssistantSessionInput): Promise<void> {
    await this.db()?.assistantSession.upsert({
      where: { anonId_sessionId: { anonId: input.anonId, sessionId: input.sessionId } },
      create: input,
      update: { lastActiveAt: new Date() },
    });
  }

  async saveRun(input: AssistantRunInput): Promise<void> {
    await this.db()?.assistantRun.create({ data: input });
  }

  async listRuns(limit: number): Promise<AssistantRunRecord[]> {
    const client = this.db();
    if (!client) return [];
    const rows = await client.assistantRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      question: row.question,
      answer: row.answer,
      citations: JSON.parse(row.citations) as string[],
      aiUsedFlag: row.aiUsedFlag,
      elapsedMs: row.elapsedMs,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async bumpRequests(date: string): Promise<number> {
    const client = this.db();
    if (!client) return 0;
    const row = await client.assistantBudget.upsert({
      where: { date },
      create: { date, requests: 1 },
      update: { requests: { increment: 1 } },
    });
    return row.requests;
  }
}
