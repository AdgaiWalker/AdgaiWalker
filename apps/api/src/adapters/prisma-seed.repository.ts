import { Inject, Injectable } from '@nestjs/common';
import type { CluePoolStatus, InterestLevel, SeedLinkRole } from '@walker/shared';
import type { SeedRecord, SeedRepositoryPort } from '../ports/seed.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { storageUnavailable } from '../common/http-error';

@Injectable()
export class PrismaSeedRepository implements SeedRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const c = this.prisma.getClient();
    if (!c) throw storageUnavailable();
    return c;
  }

  private async load(id: string): Promise<SeedRecord | null> {
    const row = await this.db().seed.findUnique({
      where: { id },
      include: { links: { include: { clue: true } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      severity: row.severity as InterestLevel | null,
      selfInterest: row.selfInterest as InterestLevel | null,
      primaryClueId: row.primaryClueId,
      createdAt: row.createdAt,
      links: row.links.map((l) => ({
        clueId: l.clueId,
        role: l.role as SeedLinkRole,
        poolStatus: l.clue.poolStatus as CluePoolStatus,
      })),
    };
  }

  async create(input: {
    id: string;
    title: string;
    severity?: InterestLevel | null;
    selfInterest?: InterestLevel | null;
  }): Promise<SeedRecord> {
    await this.db().seed.create({
      data: {
        id: input.id,
        title: input.title,
        severity: input.severity ?? null,
        selfInterest: input.selfInterest ?? null,
      },
    });
    return (await this.load(input.id))!;
  }

  async findById(id: string): Promise<SeedRecord | null> {
    return this.load(id);
  }

  async list(limit: number): Promise<SeedRecord[]> {
    const rows = await this.db().seed.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    const out: SeedRecord[] = [];
    for (const r of rows) {
      const full = await this.load(r.id);
      if (full) out.push(full);
    }
    return out;
  }

  async linkClue(input: {
    id: string;
    seedId: string;
    clueId: string;
    role: SeedLinkRole;
  }): Promise<void> {
    await this.db().seedClueLink.create({
      data: {
        id: input.id,
        seedId: input.seedId,
        clueId: input.clueId,
        role: input.role,
      },
    });
  }

  async setPrimary(seedId: string, clueId: string): Promise<SeedRecord> {
    const db = this.db();
    await db.seedClueLink.updateMany({
      where: { seedId, role: 'primary' },
      data: { role: 'backup' },
    });
    await db.seedClueLink.updateMany({
      where: { seedId, clueId },
      data: { role: 'primary' },
    });
    await db.seed.update({
      where: { id: seedId },
      data: { primaryClueId: clueId },
    });
    return (await this.load(seedId))!;
  }

  async updateTwoQuestions(
    seedId: string,
    q: { severity: InterestLevel; selfInterest: InterestLevel },
  ): Promise<SeedRecord> {
    await this.db().seed.update({
      where: { id: seedId },
      data: { severity: q.severity, selfInterest: q.selfInterest },
    });
    return (await this.load(seedId))!;
  }
}
