import { Inject, Injectable } from '@nestjs/common';
import type { ActionEntityType, ActionEvidenceRef, ActionKind, ActionSource, ActionStatus } from '@walker/shared';
import type { ActionRecord, ActionRepositoryPort, NewActionRecord } from '../ports/action.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { storageUnavailable } from '../common/http-error';

@Injectable()
export class PrismaActionRepository implements ActionRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const client = this.prisma.getClient();
    if (!client) throw storageUnavailable();
    return client;
  }

  private map(row: {
    id: string; title: string; note: string | null; kind: string; entityType: string | null;
    entityId: string | null; status: string; plannedDate: string | null;
    dueAt: Date | null; timezone: string | null; completedAt: Date | null;
    source: string; evidenceRef: unknown; createdAt: Date; updatedAt: Date;
  }): ActionRecord {
    return {
      ...row,
      kind: row.kind as ActionKind,
      entityType: row.entityType as ActionRecord['entityType'],
      status: row.status as ActionStatus,
      source: row.source as ActionSource,
      // Json 列在 Prisma 里是 unknown：只有形状正确才当作证据引用，否则如实置 null
      evidenceRef: readEvidenceRef(row.evidenceRef),
    };
  }

  async create(input: NewActionRecord): Promise<ActionRecord> {
    const { evidenceRef, ...rest } = input;
    const row = await this.db().action.create({
      data: {
        ...rest,
        // undefined 表示"不写这一列"（DB NULL）；Prisma 不接受把 null 直接塞进可空 Json
        ...(evidenceRef ? { evidenceRef } : {}),
        status: 'OPEN',
        completedAt: null,
      },
    });
    return this.map(row);
  }

  async ensureOpenForEntity(input: NewActionRecord): Promise<ActionRecord> {
    if (input.entityType && input.entityId) {
      const existing = await this.db().action.findFirst({ where: { entityType: input.entityType, entityId: input.entityId, status: 'OPEN' }, orderBy: { createdAt: 'asc' } });
      if (existing) return this.map(existing);
    }
    return this.create(input);
  }

  async findById(id: string): Promise<ActionRecord | null> {
    const row = await this.db().action.findUnique({ where: { id } });
    return row ? this.map(row) : null;
  }

  async list(input: { status?: ActionStatus; kind?: ActionKind; limit: number }): Promise<ActionRecord[]> {
    const rows = await this.db().action.findMany({ where: { status: input.status, kind: input.kind }, orderBy: [{ plannedDate: 'asc' }, { createdAt: 'desc' }], take: Math.min(input.limit, 100) });
    return rows.map((row) => this.map(row));
  }

  /** 到期未完成事项：唯一可被定时扫描领用的查询（不通过模型判断是否到期）。 */
  async listDue(before: Date, limit: number): Promise<ActionRecord[]> {
    const rows = await this.db().action.findMany({
      where: { status: 'OPEN', dueAt: { not: null, lte: before } },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      take: Math.min(Math.max(1, limit), 200),
    });
    return rows.map((row) => this.map(row));
  }

  async update(id: string, input: { title?: string; note?: string | null; plannedDate?: string | null; dueAt?: Date | null; timezone?: string | null; entityType?: ActionEntityType | null; entityId?: string | null }): Promise<ActionRecord> {
    const row = await this.db().action.update({ where: { id }, data: input });
    return this.map(row);
  }

  async setCompletion(id: string, input: { status: ActionStatus; completedAt: Date | null }): Promise<ActionRecord> {
    const row = await this.db().action.update({ where: { id }, data: input });
    return this.map(row);
  }

  async delete(id: string): Promise<void> {
    await this.db().action.delete({ where: { id } });
  }
}

/** Json 列可能是任意形状：只有 { conversationId } 是字符串才认作证据引用。 */
function readEvidenceRef(value: unknown): ActionEvidenceRef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as { conversationId?: unknown; messageIds?: unknown; capturedAt?: unknown };
  if (typeof raw.conversationId !== 'string') return null;
  return {
    conversationId: raw.conversationId,
    messageIds: Array.isArray(raw.messageIds)
      ? raw.messageIds.filter((id): id is string => typeof id === 'string')
      : [],
    capturedAt: typeof raw.capturedAt === 'string' ? raw.capturedAt : '',
  };
}
