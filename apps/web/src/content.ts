/**
 * 内容查询门面 — 绑定 gen 产物，向页面暴露已发布内容与主题线查询。
 * 依赖：generated/content.json、shared/content-series 纯函数。
 */
import { isBrowsePostType } from '@walker/shared';
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
  updated?: string;
  author?: string;
  type: string;
  form?: string;
  domain?: string;
  intent?: string;
  valueMode?: string;
  /** 生产链厅 condition|kit|lab|showcase|exchange */
  hall?: string;
  status?: string;
  summary: string;
  body: string;
  tags: string[];
  level?: string;
  emoji?: string;
  image?: string;
  url?: string;
  visibility: string;
  published: boolean;
  series?: string;
  seriesOrder?: number | null;
  related?: string[];
  aiUsePolicy?: {
    level: string;
    readable: boolean;
    citable: boolean;
    actionable: boolean;
    reason: string;
  };
  resources?: Array<{
    name: string;
    url: string;
    type: string;
    description: string;
  }>;
}

const raw = data as { items?: ContentItem[] };
const items: ContentItem[] = raw.items ?? [];

function asSeriesItems(
  list: readonly ContentItem[],
): readonly SeriesContentItem[] {
  return list;
}

export function getAllItems(): ContentItem[] {
  return items;
}

/**
 * 逛列表唯一数据门面（判定逻辑单一收口于 @walker/shared isBrowsePostType）。
 */
export function getBrowseItems(): ContentItem[] {
  return items.filter((d) => isBrowsePostType(d.type));
}

/** @deprecated 用 getBrowseItems；保留别名避免零星调用方漏改 */
export function getPublishedPosts(): ContentItem[] {
  return getBrowseItems();
}

/** @deprecated 内容宇宙已并入逛；等同 getBrowseItems（不含 tool） */
export function getPublishedContentItems(): ContentItem[] {
  return getBrowseItems();
}

export function getByType(type: string): ContentItem[] {
  return items.filter((d) => d.type === type);
}

/** 按生产链厅筛选（content-halls + frontmatter hall） */
export function getByHall(hall: string): ContentItem[] {
  const key = hall.trim();
  if (!key) return [];
  return getBrowseItems().filter((d) => (d.hall ?? '') === key);
}

/** 含 tool 等未进逛的条目（器具厅需要） */
export function getAllByHall(hall: string): ContentItem[] {
  const key = hall.trim();
  if (!key) return [];
  return items.filter((d) => (d.hall ?? '') === key);
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

export function getRelatedPosts(
  slug: string,
  excludeSlugs?: ReadonlyArray<string | null | undefined>,
): ContentItem[] {
  const exclude = excludeSlugs?.length
    ? new Set(excludeSlugs.filter((s): s is string => Boolean(s)))
    : undefined;
  return getRelatedItems(
    asSeriesItems(getPublishedPosts()),
    slug,
    exclude,
  ) as ContentItem[];
}
