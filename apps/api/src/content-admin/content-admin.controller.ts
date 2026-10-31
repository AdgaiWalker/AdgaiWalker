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
  Post,
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

  @Get(':slug/history')
  history(@Param('slug') slug: string) {
    return this.content.listVersions(slug);
  }

  @Get(':slug/history/:version')
  versionDetail(@Param('slug') slug: string, @Param('version') version: string) {
    const n = Number(version);
    if (!Number.isInteger(n) || n < 1) throw validationError('version-invalid');
    return this.content.getVersion(slug, n);
  }

  @Get(':slug/diff/:a/:b')
  versionDiff(
    @Param('slug') slug: string,
    @Param('a') a: string,
    @Param('b') b: string,
  ) {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isInteger(na) || na < 1 || !Number.isInteger(nb) || nb < 1) {
      throw validationError('version-invalid');
    }
    return this.content.diffVersions(slug, na, nb);
  }

  @Get('social-shares/summary')
  allSocialSharesSummary() {
    return this.content.getAllSocialStatsSummary();
  }

  @Get(':slug/social-shares')
  socialShares(@Param('slug') slug: string) {
    return this.content.getSocialStats(slug);
  }

  @Post(':slug/social-shares')
  recordSocialShare(
    @Param('slug') slug: string,
    @Body() body: { channel?: string; angle?: string; note?: string },
  ) {
    return this.content.recordSocialShare(slug, body ?? {});
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
