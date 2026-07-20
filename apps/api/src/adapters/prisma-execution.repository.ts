import { Inject, Injectable } from '@nestjs/common';
import type { DeliveryForm, ReviewOutcome } from '@walker/shared';
import type {
  ExecutionRecord,
  ExecutionRepositoryPort,
} from '../ports/execution.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { storageUnavailable } from '../common/http-error';

@Injectable()
export class PrismaExecutionRepository implements ExecutionRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const c = this.prisma.getClient();
    if (!c) throw storageUnavailable();
    return c;
  }

  private map(row: {
    id: string;
    seedId: string;
    status: string;
    deliveryUrl: string | null;
    deliveryForm: string | null;
    deliveryNote: string | null;
    outcome: string | null;
    evidence: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ExecutionRecord {
    return { ...row };
  }

  async create(input: { id: string; seedId: string }): Promise<ExecutionRecord> {
    const row = await this.db().execution.create({
      data: { id: input.id, seedId: input.seedId, status: 'doing' },
    });
    return this.map(row);
  }

  async findById(id: string): Promise<ExecutionRecord | null> {
    const row = await this.db().execution.findUnique({ where: { id } });
    return row ? this.map(row) : null;
  }

  async list(limit: number): Promise<ExecutionRecord[]> {
    const rows = await this.db().execution.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    return rows.map((r) => this.map(r));
  }

  async deliver(
    id: string,
    input: {
      url?: string | null;
      form?: DeliveryForm | null;
      note?: string | null;
    },
  ): Promise<ExecutionRecord> {
    const row = await this.db().execution.update({
      where: { id },
      data: {
        deliveryUrl: input.url ?? null,
        deliveryForm: input.form ?? null,
        deliveryNote: input.note ?? null,
        status: 'delivered',
      },
    });
    return this.map(row);
  }

  async review(
    id: string,
    input: { outcome: ReviewOutcome; evidence?: string | null },
  ): Promise<ExecutionRecord> {
    const row = await this.db().execution.update({
      where: { id },
      data: {
        outcome: input.outcome,
        evidence: input.evidence ?? null,
        status: 'reviewed',
      },
    });
    return this.map(row);
  }
}
