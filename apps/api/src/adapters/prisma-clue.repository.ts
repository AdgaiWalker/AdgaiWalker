import { Inject, Injectable } from '@nestjs/common';
import type { CluePoolStatus, ClueSource } from '@walker/shared';
import type { ClueRecord, ClueRepositoryPort } from '../ports/clue.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { storageUnavailable } from '../common/http-error';

@Injectable()
export class PrismaClueRepository implements ClueRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const c = this.prisma.getClient();
    if (!c) throw storageUnavailable();
    return c;
  }

  private map(row: {
    id: string;
    body: string;
    source: string;
    poolStatus: string;
    anonId: string | null;
    createdAt: Date;
  }): ClueRecord {
    return {
      id: row.id,
      body: row.body,
      source: row.source as ClueSource,
      poolStatus: row.poolStatus as CluePoolStatus,
      anonId: row.anonId,
      createdAt: row.createdAt,
    };
  }

  async create(input: {
    id: string;
    body: string;
    source: ClueSource;
    poolStatus: CluePoolStatus;
    anonId: string | null;
  }): Promise<ClueRecord> {
    const row = await this.db().clue.create({ data: input });
    return this.map(row);
  }

  async list(limit: number): Promise<ClueRecord[]> {
    const rows = await this.db().clue.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    return rows.map((r) => this.map(r));
  }

  async findById(id: string): Promise<ClueRecord | null> {
    const row = await this.db().clue.findUnique({ where: { id } });
    return row ? this.map(row) : null;
  }

  async updatePoolStatus(
    id: string,
    poolStatus: CluePoolStatus,
  ): Promise<ClueRecord> {
    const row = await this.db().clue.update({
      where: { id },
      data: { poolStatus },
    });
    return this.map(row);
  }
}
