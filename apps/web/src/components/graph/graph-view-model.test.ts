import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeGraph,
  type GraphNode,
  type KnowledgeGraph,
} from '@walker/shared';
import {
  animateOrder,
  applyGraphSettings,
  createDefaultGraphSettings,
  GRAPH_DEFAULT_SETTINGS,
  localNeighborhood,
  type GraphSettings,
} from './graph-view-model';
import { createContentGraphDomain } from './domains';

/**
 * 这些用例断言的是**视图模型本身**（过滤 / 分组 / 邻域 / 顺序），与领域无关。
 * 固定用内容领域即可；代码领域另有各自主张的用例（见 code-graph-view.test.ts）。
 */
const CONTENT_DOMAIN = createContentGraphDomain({
  browsePath: '/posts',
  bodies: {},
  navigate: () => {},
});

const apply = (graph: KnowledgeGraph, settings: GraphSettings) =>
  applyGraphSettings(graph, settings, CONTENT_DOMAIN);

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
  if (!node) throw new Error(`missing note ${slug}`);
  return node;
};

const withSettings = (patch: {
  filters?: Partial<GraphSettings['filters']>;
  groups?: GraphSettings['groups'];
  display?: Partial<GraphSettings['display']>;
  forces?: Partial<GraphSettings['forces']>;
  local?: Partial<GraphSettings['local']>;
}): GraphSettings => {
  const base = createDefaultGraphSettings();
  return {
    filters: { ...base.filters, ...patch.filters },
    groups: patch.groups ?? base.groups,
    display: { ...base.display, ...patch.display },
    forces: { ...base.forces, ...patch.forces },
    local: { ...base.local, ...patch.local },
  };
};

describe('默认设置（对齐应用 app.js 的 wQ / PJ / IJ）', () => {
  it('Filters 默认值：showTags 默认关', () => {
    expect(GRAPH_DEFAULT_SETTINGS.filters).toEqual({
      search: '',
      tags: false,
      attachments: false,
      existingFilesOnly: false,
      orphans: true,
    });
  });

  it('Display 默认值取应用 PJ（0 / 1 / 1）', () => {
    expect(GRAPH_DEFAULT_SETTINGS.display).toEqual({
      showArrow: false,
      textFadeMultiplier: 0,
      nodeSizeMultiplier: 1,
      lineSizeMultiplier: 1,
    });
  });

  it('Forces 默认值取应用 IJ（斥力为引擎值 10³）', () => {
    expect(GRAPH_DEFAULT_SETTINGS.forces).toEqual({
      centerStrength: 0.1,
      repelStrength: 1000,
      linkStrength: 1,
      linkDistance: 250,
    });
  });

  it('局部关系图默认：深度 1、正/反向链接都开、其他节点间的链接关', () => {
    expect(GRAPH_DEFAULT_SETTINGS.local).toEqual({
      depth: 1,
      forelinks: true,
      backlinks: true,
      interlinks: false,
    });
  });

  it('恢复默认返回全新对象，不与旧设置共享引用', () => {
    const a = createDefaultGraphSettings();
    const b = createDefaultGraphSettings();
    a.filters.tags = true;
    a.forces.linkDistance = 30;
    a.local.depth = 3;
    expect(b.filters.tags).toBe(false);
    expect(b.forces.linkDistance).toBe(250);
    expect(b.local.depth).toBe(1);
  });
});

describe('过滤器', () => {
  it('标签默认关（应用 showTags:false）；打开后出现标签节点与其边', () => {
    const graph = fixture();
    const off = apply(graph, createDefaultGraphSettings());
    const on = apply(graph, withSettings({ filters: { tags: true } }));
    expect(off.nodes.filter((node) => node.kind === 'tag')).toHaveLength(0);
    expect(on.nodes.filter((node) => node.kind === 'tag').length).toBeGreaterThan(0);
    expect(on.edges.length).toBeGreaterThan(off.edges.length);
  });

  it('附件默认关', () => {
    const graph = fixture();
    const off = apply(graph, createDefaultGraphSettings());
    expect(off.nodes.filter((node) => node.kind === 'attachment')).toHaveLength(0);
    const on = apply(graph, withSettings({ filters: { attachments: true } }));
    expect(on.nodes.filter((node) => node.kind === 'attachment')).toHaveLength(1);
  });

  it('只显示已存在的文件会隐藏幽灵节点', () => {
    const graph = fixture();
    const shown = apply(graph, createDefaultGraphSettings());
    expect(shown.nodes.some((node) => node.kind === 'ghost')).toBe(true);
    const hidden = apply(
      graph,
      withSettings({ filters: { existingFilesOnly: true } }),
    );
    expect(hidden.nodes.some((node) => node.kind === 'ghost')).toBe(false);
  });

  it('关掉孤立笔记会隐藏没有任何连接的笔记', () => {
    const graph = fixture();
    const kept = apply(graph, createDefaultGraphSettings());
    expect(kept.nodes.some((node) => node.kind === 'note' && node.slug === 'lonely')).toBe(true);
    const dropped = apply(graph, withSettings({ filters: { orphans: false } }));
    expect(
      dropped.nodes.some((node) => node.kind === 'note' && node.slug === 'lonely'),
    ).toBe(false);
  });

  it('搜索按查询语法过滤，语法错误时不过滤但如实报错', () => {
    const graph = fixture();
    const tagged = apply(
      graph,
      withSettings({ filters: { search: 'tag:#AI' } }),
    );
    expect(tagged.queryError).toBeNull();
    expect(
      tagged.nodes.every((node) => node.kind !== 'note' || node.tags.includes('AI')),
    ).toBe(true);

    const broken = apply(graph, withSettings({ filters: { search: '((a' } }));
    expect(broken.queryError).not.toBeNull();
    expect(broken.nodes.length).toBe(
      apply(graph, createDefaultGraphSettings()).nodes.length,
    );
  });
});

describe('颜色组', () => {
  it('命中多个颜色组时取列表最上面那个', () => {
    const graph = fixture();
    const view = apply(
      graph,
      withSettings({
        groups: [
          { id: 'a', query: 'tag:#AI', color: '#f97316' },
          { id: 'b', query: 'file:hub', color: '#16a34a' },
        ],
      }),
    );
    expect(view.colors.get('note:hub')).toBe('#f97316');
  });

  it('未命中颜色组的节点不预设颜色（由引擎取类型语义色）', () => {
    const graph = fixture();
    const view = apply(
      graph,
      withSettings({ groups: [{ id: 'a', query: 'file:hub', color: '#f97316' }] }),
    );
    expect(view.colors.has('note:hub')).toBe(true);
    expect(view.colors.has('note:leaf')).toBe(false);
  });
});

describe('局部图邻域（应用 localJumps + 方向开关）', () => {
  // hub → leaf；lonely 与 target 独立
  function chain(): KnowledgeGraph {
    return buildKnowledgeGraph({
      items: [
        { slug: 'hub', title: 'Hub', date: '2026-01-01', body: '[[leaf]]' },
        { slug: 'leaf', title: 'Leaf', date: '2026-01-02', body: '[[tail]]' },
        { slug: 'tail', title: 'Tail', date: '2026-01-03', body: '' },
        { slug: 'other', title: 'Other', date: '2026-01-04', body: '' },
      ],
    });
  }
  const ids = (result: { nodes: GraphNode[] }) =>
    result.nodes
      .map((node) =>
        node.kind === 'note' || node.kind === 'ghost' ? node.slug : node.id,
      )
      .sort();

  it('深度 1 只含直接邻居，深度 2 展开到邻居的邻居', () => {
    const graph = chain();
    expect(ids(localNeighborhood(graph, 'note:hub', { depth: 1, forelinks: true, backlinks: true, interlinks: false })))
      .toEqual(['hub', 'leaf']);
    expect(ids(localNeighborhood(graph, 'note:hub', { depth: 2, forelinks: true, backlinks: true, interlinks: false })))
      .toEqual(['hub', 'leaf', 'tail']);
  });

  it('关掉出链后只沿反向链接走', () => {
    const graph = chain();
    const result = localNeighborhood(graph, 'note:leaf', {
      depth: 2,
      forelinks: false,
      backlinks: true,
      interlinks: false,
    });
    // 反向链接：leaf ← hub，故只有 hub；tail 是 leaf 的出链，被关掉
    expect(ids(result)).toEqual(['hub', 'leaf']);
  });

  it('关掉反向链接后只沿出链走', () => {
    const graph = chain();
    const result = localNeighborhood(graph, 'note:leaf', {
      depth: 2,
      forelinks: true,
      backlinks: false,
      interlinks: false,
    });
    expect(ids(result)).toEqual(['leaf', 'tail']);
  });

  it('「其他节点间的链接」默认关：只画走出来用到的边（官方文案：显示其他节点之间的链接）', () => {
    // hub → a、hub → b，另有 a → b 这条「其他节点之间」的横向连接
    const graph = buildKnowledgeGraph({
      items: [
        { slug: 'hub', title: 'Hub', date: '2026-01-01', body: '[[a]] [[b]]' },
        { slug: 'a', title: 'A', date: '2026-01-02', body: '[[b]]' },
        { slug: 'b', title: 'B', date: '2026-01-03', body: '' },
      ],
    });
    const base = { depth: 1, forelinks: true, backlinks: true };
    const off = localNeighborhood(graph, 'note:hub', { ...base, interlinks: false });
    const on = localNeighborhood(graph, 'note:hub', { ...base, interlinks: true });

    // 节点集合不受该开关影响
    expect(ids(off)).toEqual(['a', 'b', 'hub']);
    expect(ids(on)).toEqual(['a', 'b', 'hub']);
    // 关：只有 hub 的两条出边；开：多出 a → b
    expect(off.edges).toHaveLength(2);
    expect(on.edges).toHaveLength(3);
    expect(
      on.edges.some((edge) => edge.source === 'note:a' && edge.target === 'note:b'),
    ).toBe(true);
    expect(
      off.edges.some((edge) => edge.source === 'note:a' && edge.target === 'note:b'),
    ).toBe(false);
  });

  it('深度被夹在 1–5，未知中心返回空', () => {
    const graph = chain();
    // 99 会夹到 5：链上所有可达节点都在，但不相连的 other 永远不进
    const deep = ids(
      localNeighborhood(graph, 'note:hub', {
        depth: 99,
        forelinks: true,
        backlinks: true,
        interlinks: false,
      }),
    );
    expect(deep).toEqual(['hub', 'leaf', 'tail']);
    expect(deep).not.toContain('other');
    expect(
      localNeighborhood(graph, 'note:none', {
        depth: 1,
        forelinks: true,
        backlinks: true,
        interlinks: false,
      }).nodes,
    ).toEqual([]);
  });
});

describe('视觉与交互口径', () => {
  // hover 高亮由引擎按邻接表直接完成（obsidian/engine.ts updateRelated），此处不再重复判定

  it('Animate 按 created 升序排列笔记', () => {
    const graph = fixture();
    const view = apply(graph, createDefaultGraphSettings());
    const order = animateOrder(view.nodes).map((node) => node.slug);
    expect(order).toEqual(['hub', 'leaf', 'lonely']);
  });

  it('节点权重口径由引擎按无向邻居数计算（视图模型不做二次判定）', () => {
    const graph = fixture();
    const view = apply(graph, createDefaultGraphSettings());
    // hub 的出链与 leaf 的入链都指向同一对节点；这里只断言度数数据可用
    const hub = findNote(view.nodes, 'hub');
    expect(hub.outDegree).toBeGreaterThan(0);
  });
});
