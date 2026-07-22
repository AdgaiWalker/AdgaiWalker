/**
 * 管理内容 HTTP（无令牌）
 * 触发：Admin 列表/编辑；依赖：ContentAdminService
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Put,
} from '@nestjs/common';
import { ContentAdminService } from './content-admin.service';

@Controller('admin/content')
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
