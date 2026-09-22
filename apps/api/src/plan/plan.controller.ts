/**
 * 计划面 HTTP 薄层（PRD-B / TECH-DESIGN §6.2）
 * GET /admin/plan/calendar?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
 * GET /admin/plan/next
 *
 * 全在 /admin/* 防线内，不新增公开路由；controller 不带 api/ 前缀。
 */
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { PlanService } from './plan.service';

@Controller('admin/plan')
export class PlanController {
  constructor(
    @Inject(PlanService) private readonly plan: PlanService,
  ) {}

  @Get('calendar')
  calendar(@Query('from') from?: string, @Query('to') to?: string) {
    return this.plan.calendar({ from, to });
  }

  @Get('next')
  next() {
    return this.plan.next();
  }
}
