import { Inject, Injectable } from '@nestjs/common';
import { newId } from '../common/ids';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

/**
 * 搜索缺口信号：无结果时记一笔，失败不抛（不得拖垮搜索 UI）。
 * 不写领域状态机，仅可观测副作用。
 */
@Injectable()
export class SearchEventsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  async recordMiss(query: string | undefined): Promise<void> {
    if (!this.prisma.isWritable()) return;
    const q = (query ?? '').trim().slice(0, 200);
    if (!q) return;
    const client = this.prisma.getClient();
    if (!client) return;
    try {
      await client.searchMiss.create({
        data: { id: newId(), query: q },
      });
    } catch {
      // 观测失败忽略
    }
  }
}
