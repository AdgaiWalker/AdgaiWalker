/**
 * 内容 frontmatter + body 纯解析（唯一解析入口）。
 * 扫描目录由构建脚本调用 loadPublishedFromDir（Node）。
 */

export type ContentVisibility = 'public' | 'draft' | 'private';

/**
 * 公开文章 frontmatter 必需字段合同。
 * build:web 的字段门禁（scripts/check-content-fields.ts）与工作站网站发布器
 * （apps/api PublicationService）共用这一份清单：发布物必须先过校验再落盘，
 * 门禁不迁就生成物，生成物必须天然过门禁。
 */
export const PUBLISHED_POST_REQUIRED_FIELDS = [
  'form',
  'domain',
  'intent',
  'valueMode',
  'aiUsePolicy',
  'updated',
  'summary',
] as const;

export type PublishedPostRequiredField = (typeof PUBLISHED_POST_REQUIRED_FIELDS)[number];

/** 返回缺失/为空的必需字段（空数组即通过）；判空口径与 check-content-fields 一致 */
export function missingPublishedPostFields(
  data: Record<string, unknown>,
): PublishedPostRequiredField[] {
  return PUBLISHED_POST_REQUIRED_FIELDS.filter((field) => {
    const v = data[field];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
}

export interface ContentDoc {
  slug: string;
  title: string;
  date: string;
  type: string;
  summary: string;
  body: string;
  tags: string[];
  visibility: ContentVisibility;
  published: boolean;
}

export interface RawFrontmatter {
  title?: unknown;
  date?: unknown;
  type?: unknown;
  summary?: unknown;
  description?: unknown;
  tags?: unknown;
  visibility?: unknown;
  published?: unknown;
}

/** 解析 visibility：显式优先，否则 published=false → draft，默认 public */
export function resolveVisibility(data: {
  visibility?: unknown;
  published?: unknown;
}): ContentVisibility {
  if (data.visibility === 'public' || data.visibility === 'draft' || data.visibility === 'private') {
    return data.visibility;
  }
  if (data.published === false) return 'draft';
  return 'public';
}

export function isPublicDoc(doc: Pick<ContentDoc, 'visibility'>): boolean {
  return doc.visibility === 'public';
}

/** 将 gray-matter 结果规范为 ContentDoc（纯函数，不读盘） */
export function toContentDoc(
  slug: string,
  data: RawFrontmatter,
  body: string,
): ContentDoc {
  const title = typeof data.title === 'string' ? data.title : slug;
  const date =
    data.date instanceof Date
      ? data.date.toISOString()
      : typeof data.date === 'string'
        ? data.date
        : '';
  const type = typeof data.type === 'string' ? data.type : 'knowledge';
  const summary =
    typeof data.summary === 'string'
      ? data.summary
      : typeof data.description === 'string'
        ? data.description
        : '';
  const tags = Array.isArray(data.tags)
    ? data.tags.filter((t): t is string => typeof t === 'string')
    : [];
  const visibility = resolveVisibility(data);
  const published = visibility === 'public';
  return {
    slug,
    title,
    date,
    type,
    summary,
    body: body.trim(),
    tags,
    visibility,
    published,
  };
}

export function isPostType(type: string): boolean {
  return ['knowledge', 'idea', 'project', 'learn'].includes(type);
}

/** Resolve a wiki slug to a public href; return undefined to keep plain text. */
export type WikiLinkResolver = (slug: string) => string | undefined;

/**
 * 内部链接（wiki 链接）语法的唯一来源：`[[slug]]` / `[[slug|label]]`。
 * 正文渲染（expandWikiLinks）与知识图谱抽边（graph.ts）共用同一份 pattern——
 * 两处各写一个正则就会出现「渲染得出来但图谱看不见」的静默漂移。
 * 每次返回新实例：带 /g 的正则对象有 lastIndex 状态，不可跨调用共享。
 */
export const WIKI_LINK_SOURCE = '\\[\\[([^\\]|\\n]+)(?:\\|([^\\]\\n]+))?\\]\\]';

export function wikiLinkPattern(): RegExp {
  return new RegExp(WIKI_LINK_SOURCE, 'g');
}

/** Turn `[[slug]]` / `[[slug|label]]` into markdown links when the slug is public. */
export function expandWikiLinks(
  markdown: string,
  resolveHref: WikiLinkResolver,
): string {
  return markdown.replace(
    wikiLinkPattern(),
    (full, rawSlug: string, rawLabel?: string) => {
      const slug = rawSlug.trim();
      const label = (rawLabel ?? slug).trim();
      if (!slug || !label) return full;
      const href = resolveHref(slug);
      if (!href) return label;
      return `[${label}](${href})`;
    },
  );
}
