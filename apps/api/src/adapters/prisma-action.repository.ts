import { Inject, Injectable } from '@nestjs/common';
import type { ActionKind, ActionSource, ActionStatus } from '@walker/shared';
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
    entityId: string | null; status: string; plannedDate: string | null; completedAt: Date | null;
    source: string; createdAt: Date; updatedAt: Date;
  }): ActionRecord {
    return {
      ...row,
      kind: row.kind as ActionKind,
      entityType: row.entityType as ActionRecord['entityType'],
      status: row.status as ActionStatus,
      source: row.source as ActionSource,
    };
  }

  async create(input: NewActionRecord): Promise<ActionRecord> {
    const row = await this.db().action.create({ data: { ...input, status: 'OPEN', completedAt: null } });
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

  async update(id: string, input: { title?: string; note?: string | null; plannedDate?: string | null }): Promise<ActionRecord> {
    const row = await this.db().action.update({ where: { id }, data: input });
    return this.map(row);
  }

  async setCompletion(id: string, input: { status: ActionStatus; completedAt: Date | null }): Promise<ActionRecord> {
    const row = await this.db().action.update({ where: { id }, data: input });
    return this.map(row);
  }
}
