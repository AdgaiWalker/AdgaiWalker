/**
 * 管理内容 HTTP — Bearer 鉴权
 * 触发：Admin 列表/编辑；依赖：ContentAdminService
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ContentAdminService } from './content-admin.service';

@Controller('admin/content')
@UseGuards(AdminAuthGuard)
export class ContentAdminController {
  constructor(private readonly content: ContentAdminService) {}

  @Get()
  list() {
    return this.content.list();
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.content.get(slug);
  }

  @Put(':slug')
  save(@Param('slug') slug: string, @Body() body: { raw?: string }) {
    return this.content.save(slug, body.raw ?? '');
  }
}
