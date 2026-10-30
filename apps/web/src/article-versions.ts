/**
 * 文章版本历史门面 — 绑定 gen 产物 article-versions.json，向页面暴露公开演进史。
 * 依赖：generated/article-versions.json（构建期由 content/versions 投影）。
 */
import data from './generated/article-versions.json';

export interface ArticleVersionEntry {
  version: number;
  note: string;
  publishedAt: string;
  releaseId: string;
  body: string;
}

const raw = data as { articles?: Record<string, ArticleVersionEntry[]> };
const articles: Record<string, ArticleVersionEntry[]> = raw.articles ?? {};

/** 升序版本列表；无历史返回空数组 */
export function getArticleVersions(slug: string): ArticleVersionEntry[] {
  return articles[slug] ?? [];
}

/** 某一版；不存在返回 null */
export function getArticleVersion(slug: string, version: number): ArticleVersionEntry | null {
  return (articles[slug] ?? []).find((v) => v.version === version) ?? null;
}

/** 版本数（0 = 从未发布过版本） */
export function getArticleVersionCount(slug: string): number {
  return (articles[slug] ?? []).length;
}
