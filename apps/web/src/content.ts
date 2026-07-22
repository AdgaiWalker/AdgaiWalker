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
}

const raw = data as { items?: ContentItem[] };
const items: ContentItem[] = raw.items ?? [];

const POST_TYPES = new Set(['knowledge', 'idea', 'project', 'learn']);

function asSeriesItems(
  list: readonly ContentItem[],
): readonly SeriesContentItem[] {
  return list;
}

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
