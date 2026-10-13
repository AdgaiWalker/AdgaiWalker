/**
 * 管理内容 HTTP；AppModule 的 AdminTokenMiddleware 保护所有管理方法。
 * 触发：Admin 只读/人工保存；依赖：ContentAdminService
 */
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
} from '@nestjs/common';
import { validationError } from '../common/http-error';
import { ContentAdminService } from './content-admin.service';

@Controller('admin/content')
export class ContentAdminController {
  constructor(
    @Inject(ContentAdminService)
    private readonly content: ContentAdminService,
  ) {}

  @Get()
  list() {
    return this.content.list();
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.content.get(slug);
  }

  @Put(':slug')
  save(@Param('slug') slug: string, @Body() body: { raw?: string; expectedHash?: unknown }) {
    if (!Object.prototype.hasOwnProperty.call(body ?? {}, 'expectedHash') ||
        (body.expectedHash !== null && typeof body.expectedHash !== 'string')) {
      throw validationError('保存正文必须提供 expectedHash；新建时传 null');
    }
    return this.content.save(slug, typeof body.raw === 'string' ? body.raw : '', body.expectedHash as string | null);
  }
}
