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

  /**
   * 原子条件消耗：所有分支都是单语句条件写（SQLite 单写者串行），杜绝
   * 「先查再 upsert」在并发首消时双 true、终值计数仍为 1 的竞态。
   */
  async consume(anonId: string): Promise<boolean> {
    const db = this.db();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TTL_MS);

    // 1) 未过期且未触顶：+1
    const bumped = await db.guestQuota.updateMany({
      where: { anonId, expiresAt: { gte: now }, usedCount: { lt: MAX_GUEST } },
      data: { usedCount: { increment: 1 } },
    });
    if (bumped.count === 1) return true;

    // 2) 已过期：重置为 1 并续期
    const reset = await db.guestQuota.updateMany({
      where: { anonId, expiresAt: { lt: now } },
      data: { usedCount: { set: 1 }, expiresAt: { set: expiresAt } },
    });
    if (reset.count === 1) return true;

    // 3) 无行：创建（并发撞唯一键时回到条件递增重试一次）
    try {
      await db.guestQuota.create({ data: { anonId, usedCount: 1, expiresAt } });
      return true;
    } catch {
      const retried = await db.guestQuota.updateMany({
        where: { anonId, expiresAt: { gte: now }, usedCount: { lt: MAX_GUEST } },
        data: { usedCount: { increment: 1 } },
      });
      return retried.count === 1;
    }
  }

  async release(anonId: string): Promise<void> {
    await this.db().guestQuota.updateMany({
      where: { anonId, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
  }
}
