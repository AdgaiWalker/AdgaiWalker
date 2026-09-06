import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ContentBrief, WorkStatus } from '@walker/shared';
import type { NewManualWorkRecord, NewWorkRecord, WorkRecord, WorkRepositoryPort } from '../ports/work.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { storageUnavailable } from '../common/http-error';

@Injectable()
export class PrismaWorkRepository implements WorkRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const client = this.prisma.getClient();
    if (!client) throw storageUnavailable();
    return client;
  }

  private map(row: {
    id: string; executionId: string; idempotencyKey: string; title: string; status: string;
    manifestPath: string; coreViewpoint: string; protectedClaims: unknown;
    approvedArtifactHash: string | null; currentStage: string | null; stageStartedAt: Date | null; lastOutputAt: Date | null; waitingReason: string | null; createdAt: Date; updatedAt: Date;
  }): WorkRecord {
    return {
      ...row,
      status: row.status as WorkStatus,
      currentStage: row.currentStage as WorkRecord['currentStage'],
      protectedClaims: Array.isArray(row.protectedClaims) ? row.protectedClaims.filter((item): item is string => typeof item === 'string') : [],
    };
  }

  async findById(id: string): Promise<WorkRecord | null> {
    const row = await this.db().submission.findUnique({ where: { id } });
    return row ? this.map(row) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<WorkRecord | null> {
    const row = await this.db().submission.findUnique({ where: { idempotencyKey } });
    return row ? this.map(row) : null;
  }

  async list(limit: number): Promise<WorkRecord[]> {
    const rows = await this.db().submission.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(limit, 100) });
    return rows.map((row) => this.map(row));
  }

  async createForExecution(input: NewWorkRecord): Promise<WorkRecord> {
    const db = this.db();
    const execution = await db.execution.findUnique({ where: { id: input.executionId } });
    if (!execution) throw new Error('execution-not-found');
    const row = await db.submission.create({
      data: {
        id: input.id,
        executionId: input.executionId,
        idempotencyKey: input.idempotencyKey,
        title: input.title,
        status: 'DRAFT_READY',
        manifestPath: input.manifestPath,
        coreViewpoint: input.coreViewpoint,
        protectedClaims: input.protectedClaims as unknown as Prisma.InputJsonValue,
      },
    });
    return this.map(row);
  }

  async createFromDraft(input: NewManualWorkRecord): Promise<WorkRecord> {
    const db = this.db();
    const row = await db.$transaction(async (tx) => {
      const clueId = `clue-${input.id}`;
      const seedId = `seed-${input.id}`;
      const executionId = `execution-${input.id}`;
      await tx.clue.create({ data: { id: clueId, body: input.sourceProblem, source: 'manual-self', poolStatus: 'in-pool', anonId: null } });
      await tx.seed.create({ data: { id: seedId, title: input.title, workflowStatus: 'SELECTED', whyNow: input.whyNow, primaryClueId: clueId } });
      await tx.seedClueLink.create({ data: { id: `link-${input.id}`, seedId, clueId, role: 'primary' } });
      await tx.execution.create({ data: { id: executionId, seedId, status: 'doing', contentBrief: input.contentBrief as unknown as Prisma.InputJsonValue } });
      return tx.submission.create({
        data: {
          id: input.id,
          executionId,
          idempotencyKey: input.idempotencyKey,
          title: input.title,
          status: 'DRAFT_READY',
          manifestPath: input.manifestPath,
          coreViewpoint: input.coreViewpoint,
          protectedClaims: input.protectedClaims as unknown as Prisma.InputJsonValue,
        },
      });
    });
    return this.map(row);
  }

  async setStatus(id: string, status: WorkStatus, approvedArtifactHash?: string | null): Promise<WorkRecord> {
    const row = await this.db().submission.update({ where: { id }, data: { status, approvedArtifactHash } });
    return this.map(row);
  }

  async setStatusUnless(id: string, unless: readonly WorkStatus[], status: WorkStatus, approvedArtifactHash?: string | null): Promise<WorkRecord | null> {
    const db = this.db();
    await db.submission.updateMany({
      where: { id, NOT: { status: { in: [...unless] } } },
      data: { status, approvedArtifactHash },
    });
    const row = await db.submission.findUnique({ where: { id } });
    return row ? this.map(row) : null;
  }

  async setProgress(id: string, input: {
    currentStage?: import('@walker/shared').ProductionStage | null;
    stageStartedAt?: Date | null;
    lastOutputAt?: Date | null;
    waitingReason?: string | null;
  }): Promise<WorkRecord> {
    const row = await this.db().submission.update({ where: { id }, data: input });
    return this.map(row);
  }
}
