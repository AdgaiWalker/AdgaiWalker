import data from './generated/content.json';

export interface ContentItem {
  slug: string;
  title: string;
  date: string;
  type: string;
  status?: string;
  summary: string;
  body: string;
  tags: string[];
  level?: string;
  emoji?: string;
  visibility: string;
  published: boolean;
}

/** 兼容旧生成字段 posts */
const raw = data as { items?: ContentItem[]; posts?: ContentItem[] };
const items: ContentItem[] = raw.items ?? raw.posts ?? [];

const POST_TYPES = new Set(['knowledge', 'idea', 'project', 'learn']);

export function getAllItems(): ContentItem[] {
  return items;
}

export function getPublishedPosts(): ContentItem[] {
  return items.filter((d) => POST_TYPES.has(d.type));
}

export function getByType(type: string): ContentItem[] {
  return items.filter((d) => d.type === type);
}

export function getPostBySlug(slug: string): ContentItem | undefined {
  return items.find((d) => d.slug === slug);
}

export function getRecentPosts(n = 5): ContentItem[] {
  return getPublishedPosts().slice(0, n);
}
