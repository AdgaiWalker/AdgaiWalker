import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type ReviewEntry as ReviewEntryRow } from '@prisma/client';
import { isReviewEvidenceState } from '@walker/shared';
import { ApiError, storageUnavailable } from '../common/http-error';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import type { NewReviewEntry, ReviewEntryRecord, ReviewEntryRepositoryPort } from '../ports/review-entry.repository';

function view(row: ReviewEntryRow): ReviewEntryRecord {
  if (!isReviewEvidenceState(row.evidenceState)) {
    throw new ApiError('review-record-invalid', 500, '复盘记录字段无效');
  }
  return {
    id: row.id,
    actionId: row.actionId,
    releaseId: row.releaseId,
    didWhat: row.didWhat,
    observed: row.observed,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    nextAttempt: row.nextAttempt,
    evidenceState: row.evidenceState,
    evidenceNote: row.evidenceNote,
    createdBy: row.createdBy,
    requestKey: row.requestKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaReviewEntryRepository implements ReviewEntryRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const client = this.prisma.getClient();
    if (!client) throw storageUnavailable();
    return client;
  }

  async createOnce(input: NewReviewEntry) {
    try {
      const row = await this.db().reviewEntry.create({ data: input });
      return view(row);
    } catch (error) {
      // 幂等：同一 requestKey 重复提交返回既有复盘，不产生第二条
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.findByRequestKey(input.requestKey);
      if (!existing) throw error;
      return existing;
    }
  }

  async findById(id: string) {
    const row = await this.db().reviewEntry.findUnique({ where: { id } });
    return row ? view(row) : null;
  }

  async findByRequestKey(requestKey: string) {
    const row = await this.db().reviewEntry.findUnique({ where: { requestKey } });
    return row ? view(row) : null;
  }

  async list(input: { actionId?: string; limit: number }) {
    const rows = await this.db().reviewEntry.findMany({
      where: input.actionId ? { actionId: input.actionId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, input.limit), 100),
    });
    return rows.map(view);
  }
}
