/** 管理端内容应用服务 — 读取文件仓储，人工保存委托给受审计 mutation service。 */
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import matter from 'gray-matter';
import { validateProjectMetadata } from '@walker/shared';
import { ApiError } from '../common/http-error';
import { newId } from '../common/ids';
import {
  CONTENT_FILE_REPOSITORY,
  type ContentFileRepositoryPort,
} from '../ports/content-file.repository';
import { CONTENT_MUTATION_SERVICE, type ContentMutationPort } from '../ports/content-mutation.port';

@Injectable()
export class ContentAdminService {
  constructor(
    @Inject(CONTENT_FILE_REPOSITORY)
    private readonly files: ContentFileRepositoryPort,
    @Inject(CONTENT_MUTATION_SERVICE)
    private readonly mutations: ContentMutationPort,
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

  async save(slug: string, raw: string, expectedHash: string | null) {
    // C22 项目字段校验：项目使用现有类型和字段进入受控保存
    let parsedData: Record<string, unknown> | null = null;
    try {
      const parsed = matter(raw);
      parsedData = (parsed.data ?? {}) as Record<string, unknown>;
    } catch {
      // 语法异常由后续流程或门禁捕获
    }

    if (parsedData?.type === 'project') {
      const validation = validateProjectMetadata(parsedData);
      if (!validation.valid) {
        throw new ApiError(
          'invalid-project-fields',
          HttpStatus.BAD_REQUEST,
          `项目字段校验失败：${validation.errors.join('，')}`,
        );
      }
    }

    try {
      return await this.mutations.saveManual({
        slug,
        raw,
        expectedHash,
        actor: 'owner',
        requestId: newId(),
      });
    } catch (e) {
      if (e instanceof ApiError) throw e;
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
