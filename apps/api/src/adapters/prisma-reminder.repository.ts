import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type ReminderOccurrence as ReminderOccurrenceRow } from '@prisma/client';
import { isReminderOutcome, type ReminderOutcome } from '@walker/shared';
import { ApiError, storageUnavailable } from '../common/http-error';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import type {
  NewReminderOccurrence,
  ReminderOccurrenceRecord,
  ReminderOccurrenceRepositoryPort,
} from '../ports/reminder.repository';

function view(row: ReminderOccurrenceRow): ReminderOccurrenceRecord {
  if (!isReminderOutcome(row.outcome)) {
    throw new ApiError('reminder-record-invalid', 500, '提醒发生记录字段无效');
  }
  return {
    id: row.id,
    actionId: row.actionId,
    dedupeKey: row.dedupeKey,
    dueAt: row.dueAt,
    timezone: row.timezone,
    outcome: row.outcome,
    reason: row.reason,
    notifiedAt: row.notifiedAt,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaReminderOccurrenceRepository implements ReminderOccurrenceRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const client = this.prisma.getClient();
    if (!client) throw storageUnavailable();
    return client;
  }

  async createOnce(input: NewReminderOccurrence) {
    try {
      const row = await this.db().reminderOccurrence.create({ data: { ...input, outcome: 'PENDING' } });
      return { record: view(row), created: true };
    } catch (error) {
      // 唯一键冲突 = 该到期已产生过发生记录：返回既有事实，不报错、不重复插入
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.findByDedupeKey(input.dedupeKey);
      if (!existing) throw error;
      return { record: existing, created: false };
    }
  }

  async findById(id: string) {
    const row = await this.db().reminderOccurrence.findUnique({ where: { id } });
    return row ? view(row) : null;
  }

  async findByDedupeKey(dedupeKey: string) {
    const row = await this.db().reminderOccurrence.findUnique({ where: { dedupeKey } });
    return row ? view(row) : null;
  }

  async findLatestForAction(actionId: string) {
    const row = await this.db().reminderOccurrence.findFirst({
      where: { actionId },
      orderBy: [{ dueAt: 'desc' }, { createdAt: 'desc' }],
    });
    return row ? view(row) : null;
  }

  async listForAction(actionId: string) {
    const rows = await this.db().reminderOccurrence.findMany({
      where: { actionId },
      orderBy: [{ dueAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(view);
  }

  async resolve(input: { id: string; outcome: ReminderOutcome; reason?: string | null; resolvedAt: Date }) {
    if (!isReminderOutcome(input.outcome)) throw new ApiError('invalid-reminder-outcome', 400, '提醒处置结果无效');
    const row = await this.db().reminderOccurrence.update({
      where: { id: input.id },
      data: { outcome: input.outcome, reason: input.reason ?? null, resolvedAt: input.resolvedAt },
    });
    return view(row);
  }
}
