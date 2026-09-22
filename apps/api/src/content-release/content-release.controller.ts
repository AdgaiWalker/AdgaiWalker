/**
 * 内容上线 HTTP 薄层（PRD A7/A9、TECH-DESIGN §6.2）
 * POST /admin/content/release/preflight — 门禁预检，只读，零写动作
 * POST /admin/content/release           — 触发上线，返回 { runId, status }
 * 路径不带 api/ 前缀；二者都在 /admin/* 防线内（AdminTokenMiddleware + Caddy basic auth）。
 */
import { Body, Controller, Inject, Post } from '@nestjs/common';
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
  release(@Body() body: { slug?: unknown }) {
    return this.releases.release(requireSlug(body));
  }
}
