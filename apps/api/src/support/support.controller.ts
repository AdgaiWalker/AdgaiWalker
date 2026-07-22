/**
 * 赞赏配置 — GET 公开；PUT 需管理令牌
 */
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import type { SupportConfig } from '../ports/support-config.repository';
import { SupportService } from './support.service';

@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  get() {
    return this.support.get();
  }

  @Put()
  @UseGuards(AdminAuthGuard)
  save(@Body() body: Partial<SupportConfig>) {
    return this.support.save({
      title: body.title ?? '',
      body: body.body ?? '',
      wechatQrUrl: body.wechatQrUrl ?? '',
      alipayQrUrl: body.alipayQrUrl ?? '',
      externalLinks: body.externalLinks ?? [],
    });
  }
}
