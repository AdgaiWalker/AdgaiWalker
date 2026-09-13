import { describe, expect, it } from 'vitest';
import {
  attachmentNodeId,
  buildKnowledgeGraph,
  computeGraphIssues,
  extractBodyLinks,
  ghostNodeId,
  graphNeighbors,
  noteNodeId,
  resolveVaultHref,
  stripLinkAnchor,
  tagNodeId,
  type GraphNoteNode,
  type GraphSourceItem,
  type KnowledgeGraph,
} from './graph.js';

function item(slug: string, body = '', extra: Partial<GraphSourceItem> = {}): GraphSourceItem {
  return {
    slug,
    title: slug.toUpperCase(),
    date: '2026-01-01',
    summary: `${slug} 摘要`,
    body,
    ...extra,
  };
}

function note(graph: KnowledgeGraph, slug: string): GraphNoteNode {
  const node = graph.nodes.find((candidate) => candidate.id === noteNodeId(slug));
  if (!node || node.kind !== 'note') throw new Error(`missing note node ${slug}`);
  return node;
}

describe('库内链接解析', () => {
  it('剥掉标题锚点与块锚点（PRD 偏离 D3：按整篇建边）', () => {
    expect(stripLinkAnchor('ferry-theory#sin-cos')).toBe('ferry-theory');
    expect(stripLinkAnchor('ferry-theory^block-1')).toBe('ferry-theory');
    expect(stripLinkAnchor(' ferry-theory ')).toBe('ferry-theory');
  });

  it('站内路由不是库内链接（与 Obsidian 一致：非笔记目标不算边）', () => {
    expect(resolveVaultHref('/tools/resources', '/posts')).toBeNull();
    expect(resolveVaultHref('/about', '/posts')).toBeNull();
  });

  it('识别 /posts/<slug> 与 <slug>.md 两种库内链接', () => {
    expect(resolveVaultHref('/posts/ferry-theory', '/posts')).toBe('ferry-theory');
    expect(resolveVaultHref('/posts/ferry-theory#head', '/posts')).toBe('ferry-theory');
    expect(resolveVaultHref('ferry-theory.md', '/posts')).toBe('ferry-theory');
  });

  it('外链不算边', () => {
    expect(resolveVaultHref('https://example.com/posts/x', '/posts')).toBeNull();
    expect(resolveVaultHref('mailto:a@b.c', '/posts')).toBeNull();
    expect(resolveVaultHref('//cdn.example.com/x.md', '/posts')).toBeNull();
  });
});

describe('正文抽边', () => {
  it('抽 wiki 链接（含别名）、剥锚点、忽略外链与站内路由', () => {
    const body = [
      '见 [[ferry-theory|Ferry]] 与 [[fear-as-fuel]]。',
      '[[ferry-theory#sin-cos]] 也算整篇。',
      '外部 [链接](https://example.com) 与站内 [工具库](/tools/resources) 都不是边。',
      '库内 [手写](/posts/card-table) 是边。',
    ].join('\n');
    const links = extractBodyLinks(body, { browsePath: '/posts' });
    expect(links.notes).toEqual([
      'ferry-theory',
      'fear-as-fuel',
      'ferry-theory',
      'card-table',
    ]);
    expect(links.attachments).toEqual([]);
  });

  it('命中附件集合的引用归到附件而不是笔记', () => {
    const attachments = new Map<string, string>([
      ['skill结构图.png', 'skill结构图.png'],
    ]);
    const links = extractBodyLinks('图见 [[skill结构图.png]] 与 ![图](/skill结构图.png)', {
      browsePath: '/posts',
      attachments,
    });
    expect(links.notes).toEqual([]);
    expect(links.attachments).toEqual(['skill结构图.png', 'skill结构图.png']);
  });
});

describe('建图', () => {
  it('节点 id 唯一、无自环、同边去重', () => {
    const graph = buildKnowledgeGraph({
      items: [
        item('a', '[[b]] 与 [[b|B]] 重复引用。还有 [[a]] 自环。'),
        item('b', ''),
      ],
      now: '2026-09-14T00:00:00.000Z',
      seed: 7,
    });
    const linkEdges = graph.edges.filter((edge) => edge.kind === 'link');
    expect(linkEdges).toEqual([
      { source: noteNodeId('a'), target: noteNodeId('b'), kind: 'link' },
    ]);
    expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(graph.nodes.length);
    expect(graph.seed).toBe(7);
    expect(graph.generatedAt).toBe('2026-09-14T00:00:00.000Z');
  });

  it('未解析目标建幽灵节点，且不与真实笔记冲突', () => {
    const graph = buildKnowledgeGraph({
      items: [item('a', '参见 [[ghost-note]] 与 [[b]]'), item('b', '')],
    });
    const ghost = graph.nodes.find((node) => node.kind === 'ghost');
    expect(ghost?.id).toBe(ghostNodeId('ghost-note'));
    expect(ghost?.inDegree).toBe(1);
    expect(ghost?.linkDegree).toBe(1);
    // 幽灵节点与被引用的笔记节点是两个不同 id
    expect(graph.nodes.filter((node) => node.slug === 'b')).toHaveLength(1);
  });

  it('标签是节点不是边，标签边不抬高笔记的 linkDegree', () => {
    const graph = buildKnowledgeGraph({
      items: [item('a', '', { tags: ['AI'] }), item('b', '[[a]]', { tags: ['AI'] })],
    });
    const tagNode = graph.nodes.find((node) => node.id === tagNodeId('AI'));
    expect(tagNode?.inDegree).toBe(2);
    const a = note(graph, 'a');
    // a 被 b 引用一次 → linkDegree 1；标签边只增加 totalDegree
    expect(a.linkDegree).toBe(1);
    expect(a.totalDegree).toBe(2);
    expect(a.inDegree).toBe(1);
    expect(a.outDegree).toBe(1);
  });

  it('零引用的附件仍然进图（孤岛不能被静默丢掉）', () => {
    const graph = buildKnowledgeGraph({
      items: [item('a', '')],
      attachments: ['content/log/微信支付码.jpg'],
    });
    const attachment = graph.nodes.find(
      (node) => node.id === attachmentNodeId('content/log/微信支付码.jpg'),
    );
    expect(attachment?.totalDegree).toBe(0);
  });

  it('重复 slug 只保留首个（id 唯一不变式）', () => {
    const graph = buildKnowledgeGraph({
      items: [item('a', '', { title: '第一个' }), item('a', '', { title: '第二个' })],
    });
    const notes = graph.nodes.filter((node) => node.kind === 'note');
    expect(notes).toHaveLength(1);
    expect((notes[0] as GraphNoteNode).title).toBe('第一个');
  });

  it('created 缺失时回落 date（Animate 的排序依据）', () => {
    const graph = buildKnowledgeGraph({
      items: [item('a', '', { date: '2026-07-22' })],
    });
    expect(note(graph, 'a').created).toBe('2026-07-22');
  });
});

describe('局部图', () => {
  const graph = buildKnowledgeGraph({
    items: [
      item('a', '[[b]]'),
      item('b', '[[c]]'),
      item('c', ''),
      item('lonely', ''),
    ],
  });

  it('深度 1 只含直接邻居，且包含反向链接（无向展开）', () => {
    const one = graphNeighbors(graph, noteNodeId('b'), 1);
    expect(one.nodes.map((node) => node.id).sort()).toEqual(
      [noteNodeId('a'), noteNodeId('b'), noteNodeId('c')].sort(),
    );
  });

  it('深度 2 展开到邻居的邻居', () => {
    const two = graphNeighbors(graph, noteNodeId('c'), 2);
    expect(two.nodes.map((node) => node.id)).toContain(noteNodeId('a'));
    expect(two.nodes.map((node) => node.id)).not.toContain(noteNodeId('lonely'));
  });

  it('深度被夹在 1–5', () => {
    expect(graphNeighbors(graph, noteNodeId('a'), 99).depth).toBe(5);
    expect(graphNeighbors(graph, noteNodeId('a'), 0).depth).toBe(1);
  });

  it('未知节点返回空邻域而不是抛错', () => {
    const result = graphNeighbors(graph, noteNodeId('nope'), 1);
    expect(result.nodes).toEqual([]);
  });
});

describe('结构体检', () => {
  const graph = buildKnowledgeGraph({
    items: [
      item('hub', '[[leaf]]'),
      item('leaf', ''),
      item('lonely', ''),
      item('p1', '', { series: '线A' }),
      item('p2', '', { series: '线A' }),
    ],
    attachments: ['孤图.png'],
  });
  const issues = computeGraphIssues(graph);

  it('报出孤岛（依据是 linkDegree，不是 totalDegree）', () => {
    const orphans = issues.filter((issue) => issue.kind === 'orphan');
    // lonely / p1 / p2 无正文内链；leaf 被 hub 引用
    expect(orphans.map((issue) => issue.slug).sort()).toEqual(['lonely', 'p1', 'p2']);
  });

  it('报出坏链及其引用来源', () => {
    const oneWay = issues.filter((issue) => issue.kind === 'one-way-link');
    expect(oneWay[0]?.detail).toContain('hub → leaf');
  });

  it('报出成员互不引用的主题线', () => {
    const series = issues.filter((issue) => issue.kind === 'series-without-links');
    expect(series[0]?.title).toBe('线A');
    expect(series[0]?.members?.sort()).toEqual(['p1', 'p2']);
  });

  it('报出零引用附件', () => {
    const attachment = issues.filter((issue) => issue.kind === 'attachment-orphan');
    expect(attachment[0]?.title).toBe('孤图.png');
  });
});
