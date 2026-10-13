import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ConversationLogAgent,
  ConversationLogAttempt,
  ConversationLogDetail,
  ConversationLogListItem,
  ConversationLogMessage,
  ConversationLogPage,
  ConversationLogRun,
  ConversationLogTurn,
} from '@walker/shared';
import { storageUnavailable } from '../common/http-error';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import type { ConversationQueryFilter, ConversationQueryRepositoryPort } from '../ports/conversation-query.repository';

type RawConversationRow = {
  conversationId: string;
  placementKey: string;
  contentSlug: string;
  createdAt: Date | string;
  lastActivityAt: Date | string;
  turnCount: number | bigint;
  latestQuestion: string | null;
  latestDelivery: string | null;
  latestRunState: string | null;
};

type ParticipantRow = ConversationLogAgent & { conversationId: string };

@Injectable()
export class PrismaConversationQueryRepository implements ConversationQueryRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    return db;
  }

  async health(): Promise<void> {
    await this.db().$queryRaw(Prisma.sql`
      SELECT 1 FROM "Conversation" c
      WHERE NOT EXISTS (SELECT 1 FROM "DeletionTombstone" d WHERE d."conversationId" = c."id")
      LIMIT 1
    `);
  }

  async list(input: ConversationQueryFilter): Promise<ConversationLogPage> {
    const where = this.listWhere(input);
    const rows = await this.db().$queryRaw<RawConversationRow[]>(Prisma.sql`
      SELECT
        c."id" AS "conversationId",
        c."placementKey" AS "placementKey",
        c."scopeSlug" AS "contentSlug",
        c."createdAt" AS "createdAt",
        c."updatedAt" AS "lastActivityAt",
        (SELECT COUNT(*) FROM "ConversationTurn" t WHERE t."conversationId" = c."id") AS "turnCount",
        (SELECT m."body" FROM "ConversationMessage" m
          JOIN "ConversationTurn" t ON t."id" = m."turnId"
          WHERE t."conversationId" = c."id" AND m."role" = 'visitor'
          ORDER BY t."seq" DESC, m."createdAt" DESC, m."id" DESC LIMIT 1) AS "latestQuestion",
        (SELECT m."delivery" FROM "ConversationMessage" m
          JOIN "ConversationTurn" t ON t."id" = m."turnId"
          WHERE t."conversationId" = c."id" AND m."turnId" = (
            SELECT latest."id" FROM "ConversationTurn" latest
            WHERE latest."conversationId" = c."id" ORDER BY latest."seq" DESC LIMIT 1
          ) AND m."role" = 'assistant'
          ORDER BY t."seq" DESC, m."createdAt" DESC, m."id" DESC LIMIT 1) AS "latestDelivery",
        (SELECT r."state" FROM "ConversationAttempt" a
          JOIN "ConversationTurn" t ON t."id" = a."turnId"
          JOIN "ExecutionRun" r ON r."id" = a."runId"
          WHERE t."conversationId" = c."id" AND t."seq" = (
            SELECT MAX(latest."seq") FROM "ConversationTurn" latest WHERE latest."conversationId" = c."id"
          ) ORDER BY a."createdAt" DESC, a."id" DESC LIMIT 1) AS "latestRunState"
      FROM "Conversation" c
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY c."updatedAt" DESC, c."id" DESC
      LIMIT ${input.limit + 1}
    `);
    const hasMore = rows.length > input.limit;
    const visible = rows.slice(0, input.limit);
    const ids = visible.map((row) => row.conversationId);
    const participants = await this.participants(ids);
    const items: ConversationLogListItem[] = visible.map((row) => ({
      conversationId: row.conversationId,
      placementKey: row.placementKey,
      contentSlug: row.contentSlug,
      createdAt: iso(row.createdAt),
      lastActivityAt: iso(row.lastActivityAt),
      turnCount: Number(row.turnCount),
      latestQuestion: row.latestQuestion,
      latestDelivery: row.latestDelivery as ConversationLogListItem['latestDelivery'],
      latestRunState: row.latestRunState,
      participants: participants.get(row.conversationId) ?? [],
    }));
    const last = visible.at(-1);
    return {
      items,
      nextCursor: hasMore && last ? encodeCursor({ updatedAt: iso(last.lastActivityAt), id: last.conversationId }) : null,
      limit: input.limit,
    };
  }

  async snapshotIds(input: ConversationQueryFilter, limit: number): Promise<string[]> {
    const where = this.listWhere({ ...input, cursor: null });
    const rows = await this.db().$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT c."id" AS "id"
      FROM "Conversation" c
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY c."updatedAt" DESC, c."id" DESC
      LIMIT ${Math.min(Math.max(Math.floor(limit), 1), 10_001)}
    `);
    return rows.map((row) => row.id);
  }

  async detail(conversationId: string, retentionCutoff: Date, asOf?: Date): Promise<ConversationLogDetail | null> {
    const db = this.db();
    return db.$transaction(async (tx) => {
      if (await tx.deletionTombstone.findUnique({ where: { conversationId }, select: { id: true } })) return null;
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, ...(asOf ? { createdAt: { lte: asOf } } : {}) },
        include: {
          turns: {
            ...(asOf ? { where: { createdAt: { lte: asOf } } } : {}),
            orderBy: [{ seq: 'asc' }, { id: 'asc' }],
            include: {
              messages: { ...(asOf ? { where: { createdAt: { lte: asOf } } } : {}), orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
              attempts: { ...(asOf ? { where: { createdAt: { lte: asOf } } } : {}), orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
            },
          },
        },
      });
      if (!conversation) return null;
      if (conversation.createdAt < retentionCutoff) return null;

      const turnIds = conversation.turns.map((turn) => turn.id);
      const turnRequestKeys = conversation.turns.map((turn) => turn.requestKey);
      const attempts = conversation.turns.flatMap((turn) => turn.attempts);
      const revisionIds = [...new Set(attempts.map((attempt) => attempt.agentRevisionId))];
      const attemptRunIds = attempts.flatMap((attempt) => attempt.runId ? [attempt.runId] : []);
      const resources = await tx.conversationLogResource.findMany({
        where: { conversationId, resourceType: { in: ['assistant-run', 'execution-run'] }, ...(asOf ? { registeredAt: { lte: asOf } } : {}) },
        select: { resourceType: true, resourceKey: true },
      });
      const assistantRunIds = resources.filter((item) => item.resourceType === 'assistant-run').map((item) => item.resourceKey);
      const executionResourceIds = resources.filter((item) => item.resourceType === 'execution-run').map((item) => item.resourceKey);
      const runIds = [...new Set([...attemptRunIds, ...executionResourceIds])];
      const assistantRunOr: Prisma.AssistantRunWhereInput[] = [];
      if (assistantRunIds.length > 0) assistantRunOr.push({ id: { in: assistantRunIds }, anonIdHash: conversation.anonId });
      if (turnRequestKeys.length > 0) assistantRunOr.push({ anonIdHash: conversation.anonId, requestKey: { in: turnRequestKeys } });

      const [revisionRows, runRows, assistantRunRows, events] = await Promise.all([
        revisionIds.length > 0 ? tx.agentRevision.findMany({
          where: { id: { in: revisionIds } }, include: { agent: { select: { id: true, name: true } } },
        }) : Promise.resolve([]),
        runIds.length > 0 ? tx.executionRun.findMany({
          where: { id: { in: runIds }, origin: 'public', actor: conversation.anonId, placementKey: conversation.placementKey, ...(asOf ? { createdAt: { lte: asOf } } : {}) },
          include: { events: { ...(asOf ? { where: { createdAt: { lte: asOf } } } : {}), orderBy: [{ seq: 'asc' }, { id: 'asc' }] } },
        }) : Promise.resolve([]),
        assistantRunOr.length > 0 ? tx.assistantRun.findMany({
          where: { OR: assistantRunOr, ...(asOf ? { createdAt: { lte: asOf } } : {}) },
        }) : Promise.resolve([]),
        tx.featureEvent.findMany({ where: { conversationId, ...(asOf ? { at: { lte: asOf } } : {}) }, orderBy: [{ at: 'asc' }, { id: 'asc' }] }),
      ]);

      const revisions = new Map(revisionRows.map((revision) => [revision.id, revision]));
      const runs = new Map(runRows.map((run) => [run.id, run]));
      const assistantRuns = new Map(assistantRunRows.map((run) => [run.requestKey ?? '', run]));
      const detailTurns: ConversationLogTurn[] = conversation.turns.map((turn) => ({
        id: turn.id,
        seq: turn.seq,
        createdAt: turn.createdAt.toISOString(),
        messages: turn.messages.flatMap((message): ConversationLogMessage[] => {
          if (message.role !== 'visitor' && message.role !== 'assistant') return [];
          const assistantRun = message.role === 'assistant' ? assistantRuns.get(turn.requestKey) : undefined;
          return [{
            id: message.id,
            role: message.role,
            body: message.body,
            delivery: message.delivery as ConversationLogMessage['delivery'],
            createdAt: message.createdAt.toISOString(),
            citations: assistantRun ? parseCitations(assistantRun.citations) : null,
            aiUsedFlag: assistantRun?.aiUsedFlag ?? null,
            degradeReason: assistantRun?.degradeReason ?? null,
          }];
        }),
        attempts: turn.attempts.map((attempt): ConversationLogAttempt => {
          const revision = revisions.get(attempt.agentRevisionId);
          const run = attempt.runId ? runs.get(attempt.runId) : undefined;
          return {
            id: attempt.id,
            state: attempt.state,
            createdAt: attempt.createdAt.toISOString(),
            agent: revision ? {
              agentId: revision.agentId,
              agentName: revision.agent.name,
              revision: revision.version,
              revisionId: revision.id,
              modelId: revision.modelId,
            } : null,
            run: run ? {
              id: run.id,
              state: run.state,
              kind: run.kind,
              createdAt: run.createdAt.toISOString(),
              stopReason: run.stopReason,
              tokensIn: run.tokensIn,
              tokensOut: run.tokensOut,
              elapsedMs: run.elapsedMs,
              events: run.events.map((event) => ({
                seq: event.seq,
                kind: event.kind,
                text: event.text,
                tokensIn: event.tokensIn,
                tokensOut: event.tokensOut,
                createdAt: event.createdAt.toISOString(),
              })),
            } : null,
          };
        }),
      }));

      const result: ConversationLogDetail = {
        conversationId: conversation.id,
        placementKey: conversation.placementKey,
        contentSlug: conversation.scopeSlug,
        createdAt: conversation.createdAt.toISOString(),
        lastActivityAt: (asOf && conversation.updatedAt > asOf ? latestActivityAt(conversation.createdAt, conversation.turns, events) : conversation.updatedAt).toISOString(),
        turns: detailTurns,
        interactions: events.map((event) => ({
          id: event.id,
          at: event.at.toISOString(),
          featureKey: event.featureKey,
          event: event.event,
          failCode: event.failCode,
          props: isRecord(event.props) ? event.props : null,
        })),
      };
      if (await tx.deletionTombstone.findUnique({ where: { conversationId }, select: { id: true } })) return null;
      return result;
    });
  }

  private listWhere(input: ConversationQueryFilter): Prisma.Sql[] {
    const where: Prisma.Sql[] = [Prisma.sql`
      NOT EXISTS (SELECT 1 FROM "DeletionTombstone" d WHERE d."conversationId" = c."id")
      AND c."createdAt" >= ${input.retentionCutoff}
    `];
    if (input.from) where.push(Prisma.sql`c."updatedAt" >= ${input.from}`);
    if (input.toExclusive) where.push(Prisma.sql`c."updatedAt" < ${input.toExclusive}`);
    if (input.snapshotAt) where.push(Prisma.sql`c."updatedAt" <= ${input.snapshotAt}`);
    if (input.contentSlug) where.push(Prisma.sql`c."scopeSlug" = ${input.contentSlug}`);
    if (input.placementKey) where.push(Prisma.sql`c."placementKey" = ${input.placementKey}`);
    if (input.agentId) where.push(Prisma.sql`
      EXISTS (
        SELECT 1 FROM "ConversationTurn" t
        JOIN "ConversationAttempt" a ON a."turnId" = t."id"
        JOIN "AgentRevision" rev ON rev."id" = a."agentRevisionId"
        WHERE t."conversationId" = c."id" AND rev."agentId" = ${input.agentId}
      )
    `);
    if (input.runState === 'NONE') where.push(Prisma.sql`
      NOT EXISTS (
        SELECT 1 FROM "ConversationTurn" t
        JOIN "ConversationAttempt" a ON a."turnId" = t."id"
        JOIN "ExecutionRun" r ON r."id" = a."runId"
        WHERE t."conversationId" = c."id"
      )
    `);
    else if (input.runState) where.push(Prisma.sql`
      EXISTS (
        SELECT 1 FROM "ConversationTurn" t
        JOIN "ConversationAttempt" a ON a."turnId" = t."id"
        JOIN "ExecutionRun" r ON r."id" = a."runId"
        WHERE t."conversationId" = c."id" AND r."state" = ${input.runState}
      )
    `);
    if (input.keyword) {
      const pattern = `%${input.keyword.replace(/[\\%_]/g, '\\$&')}%`;
      where.push(Prisma.sql`
        EXISTS (
          SELECT 1 FROM "ConversationTurn" t
          JOIN "ConversationMessage" m ON m."turnId" = t."id"
          WHERE t."conversationId" = c."id" AND LOWER(m."body") LIKE LOWER(${pattern}) ESCAPE '\\'
        )
      `);
    }
    if (input.cursor) where.push(Prisma.sql`
      (c."updatedAt" < ${input.cursor.updatedAt}
        OR (c."updatedAt" = ${input.cursor.updatedAt} AND c."id" < ${input.cursor.id}))
    `);
    return where;
  }

  private async participants(conversationIds: string[]): Promise<Map<string, ConversationLogAgent[]>> {
    const result = new Map<string, ConversationLogAgent[]>();
    if (conversationIds.length === 0) return result;
    const rows = await this.db().$queryRaw<ParticipantRow[]>(Prisma.sql`
      SELECT DISTINCT t."conversationId" AS "conversationId", a."id" AS "agentId",
        a."name" AS "agentName", rev."version" AS "revision"
      FROM "ConversationAttempt" attempt
      JOIN "ConversationTurn" t ON t."id" = attempt."turnId"
      JOIN "AgentRevision" rev ON rev."id" = attempt."agentRevisionId"
      JOIN "AgentUnit" a ON a."id" = rev."agentId"
      WHERE t."conversationId" IN (${Prisma.join(conversationIds)})
      ORDER BY a."name" ASC, rev."version" DESC
    `);
    for (const row of rows) {
      const current = result.get(row.conversationId) ?? [];
      current.push({ agentId: row.agentId, agentName: row.agentName, revision: Number(row.revision) });
      result.set(row.conversationId, current);
    }
    return result;
  }
}

function encodeCursor(value: { updatedAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function latestActivityAt(
  createdAt: Date,
  turns: Array<{ createdAt: Date; messages: Array<{ createdAt: Date }>; attempts: Array<{ createdAt: Date }> }>,
  events: Array<{ at: Date }>,
): Date {
  return [
    createdAt,
    ...turns.flatMap((turn) => [turn.createdAt, ...turn.messages.map((message) => message.createdAt), ...turn.attempts.map((attempt) => attempt.createdAt)]),
    ...events.map((event) => event.at),
  ].reduce((latest, value) => value > latest ? value : latest);
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseCitations(value: string): string[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (isRecord(item) && typeof item.slug === 'string') return [item.slug];
      return [];
    });
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
