import { Body, Controller, Inject, Post } from '@nestjs/common';
import { newId } from '../common/ids';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

/** 搜索无结果缺口信号（fire-and-forget 友好） */
@Controller('search-events')
export class SearchEventsController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  @Post()
  async record(
    @Body() body: { query?: string; hadResults?: boolean },
  ): Promise<{ ok: true }> {
    if (body.hadResults === false && this.prisma.isWritable()) {
      const q = (body.query ?? '').trim().slice(0, 200);
      if (q) {
        try {
          await this.prisma.getClient()!.searchMiss.create({
            data: { id: newId(), query: q },
          });
        } catch {
          // 不得拖垮搜索 UI
        }
      }
    }
    return { ok: true };
  }
}
