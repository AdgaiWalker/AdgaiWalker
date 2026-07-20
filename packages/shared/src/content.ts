/**
 * 内容 frontmatter + body 纯解析（唯一解析入口）。
 * 扫描目录由构建脚本调用 loadPublishedFromDir（Node）。
 */

export type ContentVisibility = 'public' | 'draft' | 'private';

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
