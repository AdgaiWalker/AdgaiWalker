/**
 * 内容查询门面 — 绑定 gen 产物，向页面暴露已发布内容与主题线查询。
 * 依赖：generated/content.json、shared/content-series 纯函数。
 */
import data from './generated/content.json';
import {
  getItemsBySeries,
  getItemsWithoutSeries,
  getRelatedItems,
  getSeriesNeighbors,
  listSeriesNames,
  type SeriesContentItem,
  type SeriesNeighbors,
} from './shared/content-series';

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
  series?: string;
  seriesOrder?: number | null;
  related?: string[];
  version?: number | null;
  previousVersion?: string;
}

const raw = data as { items?: ContentItem[] };
const items: ContentItem[] = raw.items ?? [];

/** 逛列表：笔记/点子/项目/学习（不含 tool 资源型） */
const BROWSE_TYPES = new Set(['knowledge', 'idea', 'project', 'learn']);

/** 内容宇宙：公开内容空间（含 tool） */
const UNIVERSE_TYPES = new Set([
  'knowledge',
  'idea',
  'project',
  'learn',
  'tool',
]);

function asSeriesItems(
  list: readonly ContentItem[],
): readonly SeriesContentItem[] {
  return list;
}

export function getAllItems(): ContentItem[] {
  return items;
}

/** 逛（/posts）用：浏览型笔记 */
export function getPublishedPosts(): ContentItem[] {
  return items.filter((d) => BROWSE_TYPES.has(d.type));
}

/** 内容宇宙用：分型空间全部公开项 */
export function getPublishedContentItems(): ContentItem[] {
  return items.filter((d) => UNIVERSE_TYPES.has(d.type));
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

/** 已发布帖子中的主题线名（数据驱动） */
export function listSeries(): string[] {
  return listSeriesNames(asSeriesItems(getPublishedPosts()));
}

export function getPostsBySeries(series: string): ContentItem[] {
  return getItemsBySeries(
    asSeriesItems(getPublishedPosts()),
    series,
  ) as ContentItem[];
}

export function getPostsWithoutSeries(): ContentItem[] {
  return getItemsWithoutSeries(
    asSeriesItems(getPublishedPosts()),
  ) as ContentItem[];
}

export function getSeriesNeighborsForSlug(slug: string): SeriesNeighbors {
  return getSeriesNeighbors(asSeriesItems(getPublishedPosts()), slug);
}

export function getRelatedPosts(slug: string): ContentItem[] {
  return getRelatedItems(
    asSeriesItems(getPublishedPosts()),
    slug,
  ) as ContentItem[];
}

/** 沿 previousVersion 向前收集版本链（旧 → 新，当前在末） */
export function getVersionChain(slug: string): ContentItem[] {
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const chain: ContentItem[] = [];
  const seen = new Set<string>();
  let cur = bySlug.get(slug);
  while (cur && !seen.has(cur.slug)) {
    seen.add(cur.slug);
    chain.unshift(cur);
    const prev = cur.previousVersion?.trim();
    if (!prev) break;
    cur = bySlug.get(prev);
  }
  // 找以当前为 previousVersion 的更新版（至多一层一层向后）
  let tip = chain[chain.length - 1];
  while (tip) {
    const newer = items.find(
      (i) => i.previousVersion?.trim() === tip!.slug && !seen.has(i.slug),
    );
    if (!newer) break;
    seen.add(newer.slug);
    chain.push(newer);
    tip = newer;
  }
  return chain;
}
