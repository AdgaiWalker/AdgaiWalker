import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { InsightsService } from './insights.service';

/** 管理侧需求信号中心（token 防线内，不进公网白名单） */
@Controller('insights')
export class InsightsController {
  constructor(
    @Inject(InsightsService) private readonly insights: InsightsService,
  ) {}

  /** 四源信号聚合视图：信号流 + 高频问题榜 + 内容缺口 */
  @Get('signals')
  signals(@Query('days') days?: string) {
    const n = days ? Number(days) : 30;
    return this.insights.signalsView(
      Number.isFinite(n) ? Math.min(Math.max(n, 1), 90) : 30,
    );
  }

  /** 生成需求周报（分析 Run，手动触发，harness 驱动） */
  @Post('report')
  async report() {
    return this.insights.generateReport();
  }

  /** 周报历史 */
  @Get('reports')
  reports(@Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 10;
    return this.insights.listReports(Number.isFinite(n) ? n : 10);
  }

  /** 周报建议 → INBOX 题苗（仅 write 类；幂等；主选仍人工） */
  @Post('suggestions/seed')
  seedFromSuggestion(
    @Body() body: { kind?: string; text?: string; evidence?: string },
  ) {
    return this.insights.createSeedFromSuggestion({
      kind: body.kind ?? '',
      text: body.text ?? '',
      evidence: body.evidence,
    });
  }
}
