/**
 * 内容上线 HTTP 薄层（PRD A7/A9、TECH-DESIGN §6.2）
 * POST /admin/content/release/preflight — 门禁预检，只读，零写动作
 * POST /admin/content/release           — 触发上线，返回 { runId, status }
 * 路径不带 api/ 前缀；二者都在 /admin/* 防线内（AdminTokenMiddleware + Caddy basic auth）。
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { validationError } from '../common/http-error';
import { ContentReleaseService } from './content-release.service';

function requireSlug(body: { slug?: unknown }): string {
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
  if (!slug) throw validationError('slug-required');
  return slug;
}

@Controller('admin/content/release')
export class ContentReleaseController {
  constructor(
    @Inject(ContentReleaseService)
    private readonly releases: ContentReleaseService,
  ) {}

  @Post('preflight')
  preflight(@Body() body: { slug?: unknown }) {
    return this.releases.preflight(requireSlug(body));
  }

  @Post()
  release(@Body() body: { slug?: unknown; releaseId?: unknown }) {
    const slug = requireSlug(body);
    const releaseId = typeof body?.releaseId === 'string' && body.releaseId.trim() ? body.releaseId.trim() : '';
    if (!releaseId) throw validationError('releaseId-required');
    return this.releases.release({ slug, releaseId });
  }

  @Post('prepare')
  prepareRelease(@Body() body: {
    slug?: unknown;
    changeId?: unknown;
    grantId?: unknown;
    requestKey?: unknown;
    versionNote?: unknown;
  }) {
    const slug = requireSlug(body);
    const changeId = typeof body?.changeId === 'string' && body.changeId.trim() ? body.changeId.trim() : undefined;
    const grantId = typeof body?.grantId === 'string' && body.grantId.trim() ? body.grantId.trim() : undefined;
    const requestKey = typeof body?.requestKey === 'string' && body.requestKey.trim() ? body.requestKey.trim() : undefined;
    const versionNote = typeof body?.versionNote === 'string' ? body.versionNote.trim() : '';
    if (!versionNote) throw validationError('version-note-required');
    return this.releases.prepareRelease({ slug, changeId, grantId, requestKey, versionNote });
  }

  @Post(':id/verify')
  verify(@Param('id') id: string) {
    return this.releases.verify(id);
  }

  @Post(':id/reconcile')
  reconcile(@Param('id') id: string) {
    return this.releases.reconcile(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.releases.cancel(id);
  }

  @Get(':slug/version')
  version(@Param('slug') slug: string) {
    return this.releases.getVersionSnapshot(slug);
  }

  @Get('target/:slug/latest')
  latestRelease(@Param('slug') slug: string) {
    return this.releases.getLatestRelease(slug);
  }

  @Get('record/:id')
  releaseDetail(@Param('id') id: string) {
    return this.releases.getRelease(id);
  }
}
