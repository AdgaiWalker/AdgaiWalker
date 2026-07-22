/**
 * 赞赏配置 HTTP
 * 职责：GET 读、PUT 合并写（未传字段保留）。
 */
import { Body, Controller, Get, Put } from '@nestjs/common';
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
  save(@Body() body: Partial<SupportConfig>) {
    return this.support.save(body);
  }
}
