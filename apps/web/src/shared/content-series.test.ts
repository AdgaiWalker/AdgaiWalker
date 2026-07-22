/**
 * 驱动 shipped content-series 纯函数（真实排序/邻篇/related 过滤逻辑）。
 */
import { describe, expect, it } from 'vitest';
import {
  compareSeriesOrder,
  getItemsBySeries,
  getRelatedItems,
  getSeriesNeighbors,
  listSeriesNames,
} from './content-series';

const fixture = [
  {
    slug: 'a',
    title: 'A',
    date: '2026-01-02',
    series: '设计思考',
    seriesOrder: 2,
    related: ['b', 'missing-slug', 'c'],
  },
  {
    slug: 'b',
    title: 'B',
    date: '2026-01-01',
    series: '设计思考',
    seriesOrder: 1,
    related: ['a'],
  },
  {
    slug: 'c',
    title: 'C',
    date: '2026-02-01',
    series: '前进三部曲',
    seriesOrder: 1,
    related: [],
  },
  {
    slug: 'd',
    title: 'D',
    date: '2026-03-01',
    series: '',
    related: ['a', 'ghost'],
  },
];

describe('listSeriesNames', () => {
  it('只收集非空 series 且不含硬编码名单', () => {
    expect(listSeriesNames(fixture)).toEqual(['前进三部曲', '设计思考']);
  });
});

describe('getItemsBySeries + compareSeriesOrder', () => {
  it('按 seriesOrder 升序排列同线文章', () => {
    const line = getItemsBySeries(fixture, '设计思考');
    expect(line.map((i) => i.slug)).toEqual(['b', 'a']);
    expect(compareSeriesOrder(line[0]!, line[1]!)).toBeLessThan(0);
  });
});

describe('getSeriesNeighbors', () => {
  it('设计思考线内 b 的 next 为 a，a 的 prev 为 b', () => {
    const fromB = getSeriesNeighbors(fixture, 'b');
    expect(fromB.prev).toBeNull();
    expect(fromB.next?.slug).toBe('a');
    const fromA = getSeriesNeighbors(fixture, 'a');
    expect(fromA.prev?.slug).toBe('b');
    expect(fromA.next).toBeNull();
  });

  it('无 series 则无邻篇', () => {
    expect(getSeriesNeighbors(fixture, 'd')).toEqual({
      prev: null,
      next: null,
    });
  });
});

describe('getRelatedItems', () => {
  it('过滤不存在的 slug 与自指', () => {
    const rel = getRelatedItems(fixture, 'a');
    expect(rel.map((i) => i.slug)).toEqual(['b', 'c']);
  });
});
