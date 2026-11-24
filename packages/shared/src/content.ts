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

export const PUBLIC_SUMMARY_PLACEHOLDER = '把一个真实问题拆开，给出可以立刻开始的最小行动。';

/**
 * 唯一内容列表/GEO 分类真相源：
 * 除 `tool`（资源工具卡，独立归入器具厅且不进 /posts 信息流）外，
 * 包括 `knowledge / idea / project / learn / wise` 及其他文章类型一律进入 `/posts` 列表与订阅源。
 */
export function isBrowsePostType(type: string): boolean {
  return type.trim().toLowerCase() !== 'tool';
}

export function isPostType(type: string): boolean {
  return isBrowsePostType(type);
}

function isValidPostDate(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== 'string' || !value.trim()) return false;
  return !Number.isNaN(new Date(value.trim()).getTime());
}

export interface PublishValidationResult {
  ok: boolean;
  missing: PublishedPostRequiredField[];
  issues: string[];
}

/**
 * 发布门禁单一契约：由 preflight（API）与站内发布流程共用，
 * 确保通过 preflight 即满足 generate-content + check-content-fields + verify-geo 全部条件。
 */
export function validatePublishablePost(input: {
  slug: string;
  frontmatter: Record<string, unknown>;
  existingPublicSummaries?: ReadonlyMap<string, string>;
}): PublishValidationResult {
  const fm = input.frontmatter;
  const missing = missingPublishedPostFields(fm);
  const issues: string[] = [];

  if (resolveVisibility(fm) !== 'public') {
    issues.push('内容可见性必须为 public');
  }
  if (!isValidPostDate(fm.updated) && !isValidPostDate(fm.date)) {
    issues.push('updated 或 date 必须是有效日期');
  } else if (fm.date !== undefined && fm.date !== null && String(fm.date).trim() !== '' && !isValidPostDate(fm.date)) {
    issues.push('date 格式无效');
  }
  const policy = fm.aiUsePolicy;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy) || typeof (policy as { level?: unknown }).level !== 'string' || !(policy as { level: string }).level.trim()) {
    issues.push('aiUsePolicy.level 不能为空');
  }
  const summary = typeof fm.summary === 'string' ? fm.summary.trim() : '';
  if (summary === PUBLIC_SUMMARY_PLACEHOLDER) {
    issues.push('summary 不能使用占位模板文案');
  }
  const postType = typeof fm.type === 'string' ? fm.type : 'knowledge';
  if (summary && isBrowsePostType(postType) && input.existingPublicSummaries) {
    const conflictSlug = input.existingPublicSummaries.get(summary);
    if (conflictSlug && conflictSlug !== input.slug) {
      issues.push(`summary 与公开文章「${conflictSlug}」重复，会导致站点构建门禁失败`);
    }
  }
  return { ok: missing.length === 0 && issues.length === 0, missing, issues };
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
