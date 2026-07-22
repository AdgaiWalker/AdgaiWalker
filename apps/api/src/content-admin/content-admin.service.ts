/**
 * 管理端内容应用服务 — 编排 ContentFileRepositoryPort
 */
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../common/http-error';
import {
  CONTENT_FILE_REPOSITORY,
  type ContentFileRepositoryPort,
} from '../ports/content-file.repository';

@Injectable()
export class ContentAdminService {
  constructor(
    @Inject(CONTENT_FILE_REPOSITORY)
    private readonly files: ContentFileRepositoryPort,
  ) {}

  list() {
    return this.files.list();
  }

  async get(slug: string) {
    const doc = await this.files.get(slug);
    if (!doc) {
      throw new ApiError(
        'content-not-found',
        HttpStatus.NOT_FOUND,
        '内容不存在',
      );
    }
    return doc;
  }

  async save(slug: string, raw: string) {
    try {
      return await this.files.save(slug, raw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'save-failed';
      if (msg === 'invalid-slug') {
        throw new ApiError(
          'invalid-slug',
          HttpStatus.BAD_REQUEST,
          'slug 须为小写 ascii 短横线',
        );
      }
      if (msg === 'invalid-frontmatter') {
        throw new ApiError(
          'invalid-frontmatter',
          HttpStatus.BAD_REQUEST,
          '正文须以 YAML frontmatter --- 开头',
        );
      }
      if (msg === 'content-log-unavailable') {
        throw new ApiError(
          'content-log-unavailable',
          HttpStatus.SERVICE_UNAVAILABLE,
          '内容目录不可用',
        );
      }
      throw new ApiError(
        'content-save-failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
        msg,
      );
    }
  }
}
