/**
 * 逛时间线规则（纯函数）
 * 职责：类型 / 标签筛选、按年分组、高频标签统计。
 *
 * 依赖：format.parseIsoDate
 * 调用：PostsPage
 * 触发：逛列表筛选变更
 * 实现：内存分组，无 IO
 */
import { parseIsoDate } from './format';

export type TimelineItem = {
  slug: string;
  title: string;
  date: string;
  series?: string;
  summary?: string;
  type: string;
  tags: string[];
};

/** 筛选键：全部 | 类型前缀 | 标签前缀 |（兼容）主题线名 */
export type TimelineFilterKey = 'all' | 'other' | string;

/** 标签筛选键前缀 */
export const TAG_FILTER_PREFIX = 'tag:';

/** 内容类型筛选键前缀 */
export const TYPE_FILTER_PREFIX = 'type:';

export function tagFilterKey(tag: string): string {
  return `${TAG_FILTER_PREFIX}${tag}`;
}

export function typeFilterKey(type: string): string {
  return `${TYPE_FILTER_PREFIX}${type}`;
}

export function filterTimelineItems<T extends TimelineItem>(
  items: readonly T[],
  key: TimelineFilterKey,
): T[] {
  if (key === 'all') return [...items];
  if (key === 'other') return items.filter((i) => !i.series?.trim());
  if (key.startsWith(TYPE_FILTER_PREFIX)) {
    const type = key.slice(TYPE_FILTER_PREFIX.length);
    return items.filter((i) => i.type === type);
  }
  if (key.startsWith(TAG_FILTER_PREFIX)) {
    const tag = key.slice(TAG_FILTER_PREFIX.length);
    return items.filter((i) => i.tags.includes(tag));
  }
  return items.filter((i) => i.series?.trim() === key);
}

export function listFrequentTags(
  items: readonly TimelineItem[],
  limit = 12,
): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const t of item.tags) {
      const key = t.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
    .slice(0, limit)
    .map(([t]) => t);
}

export function groupPostsByYear<T extends TimelineItem>(
  items: readonly T[],
): { year: number; items: T[] }[] {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const d = parseIsoDate(item.date);
    const year = Number.isNaN(d.getTime()) ? 0 : d.getFullYear();
    const list = map.get(year) ?? [];
    list.push(item);
    map.set(year, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, group]) => ({ year, items: group }));
}
