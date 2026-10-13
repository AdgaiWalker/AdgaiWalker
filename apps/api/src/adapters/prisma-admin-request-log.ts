import { Inject, Injectable } from '@nestjs/common';
import { storageUnavailable } from '../common/http-error';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import type { AdminRequestLogPort } from '../ports/admin-request-log.port';

@Injectable()
export class PrismaAdminRequestLog implements AdminRequestLogPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}
  private db() {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    return db;
  }
  async begin(input: { id: string; actor: string; method: string; path: string }) {
    await this.db().adminRequestLog.create({ data: input });
  }
  async finish(id: string, path: string, statusCode: number, durationMs: number) {
    await this.db().adminRequestLog.update({ where: { id }, data: { path, statusCode, durationMs } });
  }
  list(input: { limit: number; before?: string; method?: string }) {
    return this.db().adminRequestLog.findMany({
      where: input.method === 'WRITE'
        ? { method: { in: ['POST', 'PUT', 'PATCH', 'DELETE'] } }
        : input.method ? { method: input.method } : undefined,
      ...(input.before ? { cursor: { id: input.before }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: input.limit,
    });
  }
}
