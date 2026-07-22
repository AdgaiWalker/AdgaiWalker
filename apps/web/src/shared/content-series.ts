/**
 * 主题线 / 系列邻篇 / related 解析 — 纯函数，无 IO。
 * 职责：在已发布内容集合上推导筛选键、同线邻居与存活 related。
 */

export type SeriesContentItem = {
  slug: string;
  title: string;
  date: string;
  series?: string;
  seriesOrder?: number | null;
  related?: string[];
};

export type SeriesNeighbors = {
  prev: SeriesContentItem | null;
  next: SeriesContentItem | null;
};

function seriesKey(item: SeriesContentItem): string {
  return (item.series ?? '').trim();
}

/** 同系列内排序：seriesOrder 有限数字优先升序，否则 date 升序，再 slug */
export function compareSeriesOrder(
  a: SeriesContentItem,
  b: SeriesContentItem,
): number {
  const ao =
    typeof a.seriesOrder === 'number' && Number.isFinite(a.seriesOrder)
      ? a.seriesOrder
      : null;
  const bo =
    typeof b.seriesOrder === 'number' && Number.isFinite(b.seriesOrder)
      ? b.seriesOrder
      : null;
  if (ao !== null && bo !== null && ao !== bo) return ao - bo;
  if (ao !== null && bo === null) return -1;
  if (ao === null && bo !== null) return 1;
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

/** 非空主题线名，按名称排序（数据驱动，无硬编码名单） */
export function listSeriesNames(
  items: readonly SeriesContentItem[],
): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const s = seriesKey(item);
    if (s) set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function getItemsBySeries(
  items: readonly SeriesContentItem[],
  series: string,
): SeriesContentItem[] {
  const key = series.trim();
  return items
    .filter((i) => seriesKey(i) === key)
    .slice()
    .sort(compareSeriesOrder);
}

export function getItemsWithoutSeries(
  items: readonly SeriesContentItem[],
): SeriesContentItem[] {
  return items.filter((i) => !seriesKey(i));
}

export function getSeriesNeighbors(
  items: readonly SeriesContentItem[],
  slug: string,
): SeriesNeighbors {
  const current = items.find((i) => i.slug === slug);
  if (!current || !seriesKey(current)) {
    return { prev: null, next: null };
  }
  const line = getItemsBySeries(items, seriesKey(current));
  const idx = line.findIndex((i) => i.slug === slug);
  if (idx < 0) return { prev: null, next: null };
  return {
    prev: idx > 0 ? line[idx - 1]! : null,
    next: idx < line.length - 1 ? line[idx + 1]! : null,
  };
}

/** 仅返回已出现在 items 中的 related 目标 */
export function getRelatedItems(
  items: readonly SeriesContentItem[],
  slug: string,
): SeriesContentItem[] {
  const current = items.find((i) => i.slug === slug);
  if (!current?.related?.length) return [];
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const out: SeriesContentItem[] = [];
  const seen = new Set<string>();
  for (const ref of current.related) {
    const key = ref.trim();
    if (!key || seen.has(key) || key === slug) continue;
    const hit = bySlug.get(key);
    if (hit) {
      seen.add(key);
      out.push(hit);
    }
  }
  return out;
}
