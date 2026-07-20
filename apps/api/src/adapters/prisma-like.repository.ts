import { Inject, Injectable } from '@nestjs/common';
import type { LikeRepositoryPort } from '../ports/like.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { storageUnavailable } from '../common/http-error';

@Injectable()
export class PrismaLikeRepository implements LikeRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const c = this.prisma.getClient();
    if (!c) throw storageUnavailable();
    return c;
  }

  async getCount(path: string): Promise<number> {
    const row = await this.db().likeCounter.findUnique({ where: { path } });
    return row?.count ?? 0;
  }

  async increment(path: string): Promise<number> {
    const row = await this.db().likeCounter.upsert({
      where: { path },
      create: { path, count: 1 },
      update: { count: { increment: 1 } },
    });
    return row.count;
  }
}
