/**
 * 内容台账 HTTP 薄层（PRD A1 / TECH-DESIGN §6.2）
 * GET /admin/content/ledger
 *
 * 路由顺序硬约束：本 controller 必须在 kernel.module 的 controllers 数组中
 * 声明在 ContentAdminController 之前——后者已有 @Get(':slug')（content-admin.controller.ts:27-30），
 * 若排在前面，`/admin/content/ledger` 会被 `:slug` 通配吃掉（Nest 按注册顺序匹配）。
 */
import { Controller, Get, Inject } from '@nestjs/common';
import { ContentLedgerService } from './content-ledger.service';

@Controller('admin/content')
export class ContentLedgerController {
  constructor(
    @Inject(ContentLedgerService)
    private readonly ledger: ContentLedgerService,
  ) {}

  @Get('ledger')
  list() {
    return this.ledger.ledger();
  }
}
