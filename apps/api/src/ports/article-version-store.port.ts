/**
 * 文章版本库端口（公开区，只追加）。
 * 物理独立：草稿区 = CONTENT_FILE_REPOSITORY（content/log，可改）；
 * 公开区 = ARTICLE_VERSION_STORE（content/versions，只追加，无删除路径）。
 */
import type { ArticleVersionIndex } from '@walker/shared';

export interface ArticleVersionStorePort {
  /** 读版本索引；不存在返回 null（从未发布过版本） */
  readIndex(slug: string): Promise<ArticleVersionIndex | null>;
  /** 读某版正文（blob 按 contentHash 寻址）；不存在返回 null */
  readBody(contentHash: string): Promise<string | null>;
  /**
   * 追加新版本（唯一写入口）：
   * - blob 按 hash 写入（已存在即跳过，内容寻址天然幂等）
   * - index 全量重写（索引是投影，正文 blob 才是不可变事实）
   * 语义保证只追加：版本号由 shared appendArticleVersion 派生，相同内容不建版本。
   */
  appendVersion(input: {
    slug: string;
    rawBody: string;
    note: string;
    publishedAt: string;
    releaseId: string;
  }): Promise<{ index: ArticleVersionIndex; created: boolean }>;
  /** 列出全部有版本历史的文章 slug */
  listSlugs(): Promise<string[]>;
}

export const ARTICLE_VERSION_STORE = Symbol('ARTICLE_VERSION_STORE');
