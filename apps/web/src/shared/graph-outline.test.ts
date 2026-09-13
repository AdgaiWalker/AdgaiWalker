import { describe, expect, it } from 'vitest';
import { buildKnowledgeGraph } from '@walker/shared';
import { buildGraphOutline } from './graph-outline';

function outline() {
  return buildGraphOutline(
    buildKnowledgeGraph({
      items: [
        // onlyOut：被 hub 引用，但自己谁也不引用
        { slug: 'hub', title: 'Hub', date: '2026-01-01', summary: '枢纽', body: '[[onlyOut]] 与 [[missing]]' },
        { slug: 'onlyOut', title: '只被引用', date: '2026-02-01', summary: '无出链', body: '' },
        { slug: 'lonely', title: '孤立', date: '2026-03-01', summary: '没有连接', series: '线A', body: '' },
        { slug: 'peer', title: '同线', date: '2026-04-01', summary: '同主题线', series: '线A', body: '' },
      ],
      attachments: ['content/log/孤图.png'],
      seed: 1,
      now: '2026-09-14T00:00:00.000Z',
    }),
  );
}

describe('图谱文字兜底结构', () => {
  it('孤岛口径 = 正文内链度为 0（无出链但有入链不算孤岛）', () => {
    const result = outline();
    const slugs = result.isolated.map((entry) => entry.slug).sort();
    // onlyOut 有入链 → 不是孤岛；lonely / peer 才是
    expect(slugs).toEqual(['lonely', 'peer']);
    expect(slugs).not.toContain('onlyOut');
  });

  it('出链里区分已存在与尚不存在的目标', () => {
    const result = outline();
    const hub = result.entries.find((entry) => entry.slug === 'hub')!;
    expect(hub.links).toEqual([
      { slug: 'onlyOut', title: '只被引用', resolved: true },
      { slug: 'missing', title: 'missing', resolved: false },
    ]);
  });

  it('坏链汇总出引用来源', () => {
    const result = outline();
    expect(result.ghosts).toEqual([{ slug: 'missing', referencedBy: ['hub'] }]);
  });

  it('主题线按成员聚合，并统计标签与附件', () => {
    const result = outline();
    expect(result.series).toEqual([{ name: '线A', slugs: ['lonely', 'peer'] }]);
    expect(result.attachmentCount).toBe(1);
    expect(result.linkCount).toBe(2);
  });

  it('条目按标题稳定排序，保证预渲染产物可复现', () => {
    const first = outline().entries.map((entry) => entry.slug);
    const second = outline().entries.map((entry) => entry.slug);
    expect(first).toEqual(second);
  });
});
