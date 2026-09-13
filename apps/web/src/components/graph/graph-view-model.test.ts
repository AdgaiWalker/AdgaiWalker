import { describe, expect, it } from 'vitest';
import { buildKnowledgeGraph, type KnowledgeGraph } from '@walker/shared';
import {
  animateOrder,
  applyGraphSettings,
  createDefaultGraphSettings,
  edgeStroke,
  GRAPH_DEFAULT_SETTINGS,
  hoverHighlight,
  nodeRadius,
  type GraphSettings,
} from './graph-view-model';

function fixture(): KnowledgeGraph {
  return buildKnowledgeGraph({
    items: [
      { slug: 'hub', title: 'Hub', date: '2026-01-01', tags: ['AI'], body: '[[leaf]] 与 [[missing]]' },
      { slug: 'leaf', title: 'Leaf', date: '2026-02-01', tags: ['AI'], created: '2026-02-01', body: '' },
      { slug: 'lonely', title: 'Lonely', date: '2026-03-01', tags: [], body: '' },
    ],
    attachments: ['content/log/孤图.png'],
    seed: 5,
    now: '2026-09-14T00:00:00.000Z',
  });
}

const findNote = (nodes: GraphNode[], slug: string) => {
  const node = nodes.find((candidate) => candidate.kind === 'note' && candidate.slug === slug);
  if (!node || node.kind !== 'note') throw new Error(`missing note ${slug}`);
  return node;
};

const withSettings = (patch: {
  filters?: Partial<GraphSettings['filters']>;
  groups?: GraphSettings['groups'];
  display?: Partial<GraphSettings['display']>;
  forces?: Partial<GraphSettings['forces']>;
}): GraphSettings => {
  const base = createDefaultGraphSettings();
  return {
    filters: { ...base.filters, ...patch.filters },
    groups: patch.groups ?? base.groups,
    display: { ...base.display, ...patch.display },
    forces: { ...base.forces, ...patch.forces },
  };
};

describe('默认设置', () => {
  it('四组默认值逐项对齐 Obsidian', () => {
    expect(GRAPH_DEFAULT_SETTINGS.filters).toEqual({
      search: '',
      tags: true,
      attachments: false,
      existingFilesOnly: false,
      orphans: true,
    });
    expect(GRAPH_DEFAULT_SETTINGS.display).toEqual({
      arrows: false,
      textFadeThreshold: 0.5,
      nodeSize: 1,
      linkThickness: 1,
    });
    expect(GRAPH_DEFAULT_SETTINGS.forces).toEqual({
      centerForce: 0.5,
      repelForce: 10,
      linkForce: 1,
      linkDistance: 250,
    });
  });

  it('恢复默认返回全新对象，不与旧设置共享引用', () => {
    const a = createDefaultGraphSettings();
    const b = createDefaultGraphSettings();
    a.filters.tags = false;
    a.forces.linkDistance = 30;
    expect(b.filters.tags).toBe(true);
    expect(b.forces.linkDistance).toBe(250);
  });
});

describe('过滤器', () => {
  it('标签默认开；关掉后标签节点与其边一并消失', () => {
    const graph = fixture();
    const on = applyGraphSettings(graph, createDefaultGraphSettings());
    const off = applyGraphSettings(graph, withSettings({ filters: { tags: false } }));

    expect(on.nodes.filter((node) => node.kind === 'tag').length).toBeGreaterThan(0);
    expect(off.nodes.filter((node) => node.kind === 'tag')).toHaveLength(0);
    expect(off.edges.length).toBeLessThan(on.edges.length);
  });

  it('附件默认关', () => {
    const graph = fixture();
    const off = applyGraphSettings(graph, createDefaultGraphSettings());
    expect(off.nodes.filter((node) => node.kind === 'attachment')).toHaveLength(0);
    const on = applyGraphSettings(
      graph,
      withSettings({ filters: { attachments: true } }),
    );
    expect(on.nodes.filter((node) => node.kind === 'attachment')).toHaveLength(1);
  });

  it('只显示已存在的文件会隐藏幽灵节点', () => {
    const graph = fixture();
    const shown = applyGraphSettings(graph, createDefaultGraphSettings());
    expect(shown.nodes.some((node) => node.kind === 'ghost')).toBe(true);
    const hidden = applyGraphSettings(
      graph,
      withSettings({ filters: { existingFilesOnly: true } }),
    );
    expect(hidden.nodes.some((node) => node.kind === 'ghost')).toBe(false);
  });

  it('关掉孤立笔记会隐藏没有任何连接的笔记', () => {
    const graph = fixture();
    const kept = applyGraphSettings(graph, createDefaultGraphSettings());
    expect(kept.nodes.some((node) => node.kind === 'note' && node.slug === 'lonely')).toBe(true);
    const dropped = applyGraphSettings(
      graph,
      withSettings({ filters: { orphans: false } }),
    );
    expect(dropped.nodes.some((node) => node.slug === 'lonely')).toBe(false);
  });

  it('搜索按查询语法过滤，语法错误时不过滤但如实报错', () => {
    const graph = fixture();
    const tagged = applyGraphSettings(
      graph,
      withSettings({ filters: { search: 'tag:#AI' } }),
    );
    expect(tagged.queryError).toBeNull();
    expect(tagged.nodes.every((node) => node.kind !== 'note' || node.tags.includes('AI'))).toBe(true);

    const broken = applyGraphSettings(
      graph,
      withSettings({ filters: { search: '((a' } }),
    );
    expect(broken.queryError).not.toBeNull();
    expect(broken.nodes.length).toBe(applyGraphSettings(graph, createDefaultGraphSettings()).nodes.length);
  });
});

describe('分组', () => {
  it('命中多个分组时取列表最上面那个', () => {
    const graph = fixture();
    const view = applyGraphSettings(
      graph,
      withSettings({
        groups: [
          { id: 'a', query: 'tag:#AI', color: '#f97316' },
          { id: 'b', query: 'file:hub', color: '#22c55e' },
        ],
      }),
    );
    expect(view.colors.get('note:hub')).toBe('#f97316');
  });

  it('未命中分组的节点不预设颜色（交由主题默认色）', () => {
    const graph = fixture();
    const view = applyGraphSettings(
      graph,
      withSettings({ groups: [{ id: 'a', query: 'file:hub', color: '#f97316' }] }),
    );
    expect(view.colors.has('note:hub')).toBe(true);
    expect(view.colors.has('note:leaf')).toBe(false);
  });
});

describe('视觉口径', () => {
  it('hover 高亮该节点的边与邻居', () => {
    const graph = fixture();
    const view = applyGraphSettings(graph, createDefaultGraphSettings());
    const result = hoverHighlight(view.edges, 'note:hub');
    expect(result.neighbors.has('note:hub')).toBe(true);
    expect(result.neighbors.has('note:leaf')).toBe(true);
    expect(result.edges.size).toBeGreaterThan(0);
  });

  it('节点半径随入链数增大（Obsidian：被引用越多越大）', () => {
    const graph = fixture();
    const view = applyGraphSettings(graph, createDefaultGraphSettings());
    const hub = view.nodes.find((node) => node.slug === 'hub')!;
    const leaf = view.nodes.find((node) => node.slug === 'leaf')!;
    const display = createDefaultGraphSettings().display;
    expect(nodeRadius(leaf, display)).toBeGreaterThan(nodeRadius(hub, display));
    expect(nodeRadius(hub, { ...display, nodeSize: 2 })).toBeGreaterThan(
      nodeRadius(hub, display),
    );
  });

  it('正文内链是实线，标签与附件边是虚线（语义可区分）', () => {
    expect(edgeStroke('link').dash).toEqual([]);
    expect(edgeStroke('tag').dash).not.toEqual([]);
    expect(edgeStroke('attachment').dash).not.toEqual([]);
    expect(edgeStroke('tag').alpha).toBeLessThan(edgeStroke('link').alpha);
  });

  it('Animate 按 created 升序排列笔记', () => {
    const graph = fixture();
    const view = applyGraphSettings(graph, createDefaultGraphSettings());
    const order = animateOrder(view.nodes).map((node) => node.slug);
    expect(order).toEqual(['hub', 'leaf', 'lonely']);
  });
});
