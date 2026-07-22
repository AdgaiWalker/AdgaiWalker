import { describe, expect, it } from 'vitest';
import {
  filterTimelineItems,
  groupPostsByYear,
  listFrequentTags,
  tagFilterKey,
  type TimelineItem,
} from './posts-timeline';

const sample: TimelineItem[] = [
  {
    slug: 'a',
    title: 'A',
    date: '2026-01-10',
    type: 'knowledge',
    tags: ['AI', '哲学'],
    series: 'Ferry',
  },
  {
    slug: 'b',
    title: 'B',
    date: '2025-06-01',
    type: 'knowledge',
    tags: ['AI'],
  },
  {
    slug: 'c',
    title: 'C',
    date: '2026-03-01',
    type: 'idea',
    tags: ['产品'],
    series: 'Ferry',
  },
];

describe('filterTimelineItems', () => {
  it('all 返回全部', () => {
    expect(filterTimelineItems(sample, 'all')).toHaveLength(3);
  });
  it('other 仅无 series', () => {
    expect(filterTimelineItems(sample, 'other').map((i) => i.slug)).toEqual([
      'b',
    ]);
  });
  it('按系列名精确匹配', () => {
    expect(filterTimelineItems(sample, 'Ferry').map((i) => i.slug)).toEqual([
      'a',
      'c',
    ]);
  });
  it('标签筛选', () => {
    expect(
      filterTimelineItems(sample, tagFilterKey('AI')).map((i) => i.slug),
    ).toEqual(['a', 'b']);
  });
});

describe('groupPostsByYear', () => {
  it('按年降序分组', () => {
    const g = groupPostsByYear(sample);
    expect(g.map((x) => x.year)).toEqual([2026, 2025]);
    expect(g[0]?.items).toHaveLength(2);
    expect(g[1]?.items.map((i) => i.slug)).toEqual(['b']);
  });
});

describe('listFrequentTags', () => {
  it('按频次列出标签', () => {
    expect(listFrequentTags(sample, 5)[0]).toBe('AI');
    expect(listFrequentTags(sample, 5).slice(1).sort()).toEqual(
      ['产品', '哲学'].sort(),
    );
  });
});
