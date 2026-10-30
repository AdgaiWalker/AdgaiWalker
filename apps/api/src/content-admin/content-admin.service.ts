/** 管理端内容应用服务 — 读取文件仓储，人工保存委托给受审计 mutation service。 */
import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import matter from 'gray-matter';
import { validateProjectMetadata } from '@walker/shared';
import { ApiError } from '../common/http-error';
import { newId } from '../common/ids';
import {
  CONTENT_FILE_REPOSITORY,
  type ContentFileRepositoryPort,
} from '../ports/content-file.repository';
import { CONTENT_MUTATION_SERVICE, type ContentMutationPort } from '../ports/content-mutation.port';
import { ARTICLE_VERSION_STORE, type ArticleVersionStorePort } from '../ports/article-version-store.port';
import { computeTextDiff } from '@walker/shared';

@Injectable()
export class ContentAdminService {
  constructor(
    @Inject(CONTENT_FILE_REPOSITORY)
    private readonly files: ContentFileRepositoryPort,
    @Inject(CONTENT_MUTATION_SERVICE)
    private readonly mutations: ContentMutationPort,
    @Optional() @Inject(ARTICLE_VERSION_STORE)
    private readonly versions?: ArticleVersionStorePort,
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

  // ---- 版本历史（只读；版本库为只追加公开区，此处无写路径） ----

  /** 列版本（不带正文） */
  async listVersions(slug: string) {
    if (!this.versions) throw new ApiError('article-versions-unavailable', HttpStatus.SERVICE_UNAVAILABLE, '版本库不可用');
    const index = await this.versions.readIndex(slug);
    return { slug, versions: index ? [...index.versions].reverse() : [] };
  }

  /** 看某版（带正文） */
  async getVersion(slug: string, version: number) {
    if (!this.versions) throw new ApiError('article-versions-unavailable', HttpStatus.SERVICE_UNAVAILABLE, '版本库不可用');
    const index = await this.versions.readIndex(slug);
    const entry = index?.versions.find((v) => v.version === version);
    if (!index || !entry) {
      throw new ApiError('article-version-not-found', HttpStatus.NOT_FOUND, '找不到该版本');
    }
    const body = await this.versions.readBody(entry.contentHash);
    if (body === null) {
      throw new ApiError('article-version-body-missing', HttpStatus.INTERNAL_SERVER_ERROR, '版本正文缺失');
    }
    return { slug, version: entry, body };
  }

  /** 比两版（diff 现算，不落盘） */
  async diffVersions(slug: string, a: number, b: number) {
    if (!this.versions) throw new ApiError('article-versions-unavailable', HttpStatus.SERVICE_UNAVAILABLE, '版本库不可用');
    const index = await this.versions.readIndex(slug);
    const va = index?.versions.find((v) => v.version === a);
    const vb = index?.versions.find((v) => v.version === b);
    if (!va || !vb) {
      throw new ApiError('article-version-not-found', HttpStatus.NOT_FOUND, '找不到该版本');
    }
    const [bodyA, bodyB] = await Promise.all([
      this.versions.readBody(va.contentHash),
      this.versions.readBody(vb.contentHash),
    ]);
    if (bodyA === null || bodyB === null) {
      throw new ApiError('article-version-body-missing', HttpStatus.INTERNAL_SERVER_ERROR, '版本正文缺失');
    }
    return { slug, a: va, b: vb, diff: computeTextDiff(bodyA, bodyB) };
  }

}
