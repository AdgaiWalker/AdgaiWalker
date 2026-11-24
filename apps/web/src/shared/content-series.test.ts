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

  it('从正文出链与反向入链自动派生相关文章，合并存量 related 去重，并支持排除上下篇', () => {
    const graphFixture = [
      { slug: 'old', title: 'Old', date: '2026-01-01', body: '', related: ['ref'] },
      { slug: 'next', title: 'Next', date: '2026-01-02', body: '承接 [[old]] 并提到 [[ref]]' },
      { slug: 'ref', title: 'Ref', date: '2026-01-03', body: '' },
    ];
    expect(getRelatedItems(graphFixture, 'old').map((i) => i.slug)).toEqual(['next', 'ref']);
    expect(getRelatedItems(graphFixture, 'next').map((i) => i.slug)).toEqual(['old', 'ref']);
    expect(getRelatedItems(graphFixture, 'old', new Set(['next'])).map((i) => i.slug)).toEqual(['ref']);
  });
});
