import { Inject, Injectable } from '@nestjs/common';
import type { GuestQuotaPort } from '../ports/guest-quota.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { storageUnavailable } from '../common/http-error';

const MAX_GUEST = 1;
const TTL_MS = 30 * 24 * 3600 * 1000;

@Injectable()
export class PrismaGuestQuotaAdapter implements GuestQuotaPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const c = this.prisma.getClient();
    if (!c) throw storageUnavailable();
    return c;
  }

  async isExhausted(anonId: string): Promise<boolean> {
    const row = await this.db().guestQuota.findUnique({ where: { anonId } });
    if (!row) return false;
    if (row.expiresAt.getTime() < Date.now()) return false;
    return row.usedCount >= MAX_GUEST;
  }

  async consume(anonId: string): Promise<boolean> {
    const db = this.db();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TTL_MS);
    const existing = await db.guestQuota.findUnique({ where: { anonId } });
    if (!existing || existing.expiresAt.getTime() < now.getTime()) {
      await db.guestQuota.upsert({
        where: { anonId },
        create: { anonId, usedCount: 1, expiresAt },
        update: { usedCount: 1, expiresAt },
      });
      return true;
    }
    if (existing.usedCount >= MAX_GUEST) return false;
    await db.guestQuota.update({
      where: { anonId },
      data: { usedCount: existing.usedCount + 1 },
    });
    return true;
  }
}
