import { describe, expect, it } from 'vitest';
import { buildKnowledgeGraph, type KnowledgeGraph } from '@walker/shared';
import type { KnowledgeGraphPort } from '../ports/knowledge-graph.port';
import { GraphService } from './graph.service';

function port(graph: KnowledgeGraph): KnowledgeGraphPort {
  return { async load() { return graph; } };
}

function fixture(): KnowledgeGraph {
  return buildKnowledgeGraph({
    items: [
      { slug: 'hub', title: '枢纽', date: '2026-01-01', summary: '', body: '[[leaf]] 与 [[missing]]' },
      { slug: 'leaf', title: '叶子', date: '2026-02-01', summary: '', body: '' },
      { slug: 'lonely', title: '孤岛', date: '2026-03-01', summary: '', series: '线A', body: '' },
      { slug: 'peer', title: '同线', date: '2026-04-01', summary: '', series: '线A', body: '' },
    ],
    attachments: ['孤图.png'],
    now: '2026-09-14T00:00:00.000Z',
    seed: 1,
  });
}

describe('图谱结构体检', () => {
  it('汇总节点/边/问题计数，半径口径为入链数', async () => {
    const view = await new GraphService(port(fixture())).health();

    expect(view.nodeCounts.note).toBe(4);
    expect(view.nodeCounts.ghost).toBe(1);
    // hub 同时引用 leaf 与 missing → 2 条正文内链
    expect(view.edgeCounts.link).toBe(2);
    expect(view.totals).toEqual({ notes: 4, linkEdges: 2, isolatedNotes: 2 });
    expect(view.generatedAt).toBe('2026-09-14T00:00:00.000Z');
  });

  it('孤岛 = 正文内链度为 0（被引用的 leaf 不算孤岛）', async () => {
    const view = await new GraphService(port(fixture())).health();
    const orphans = view.issues
      .filter((issue) => issue.kind === 'orphan')
      .map((issue) => issue.slug);
    expect(orphans.sort()).toEqual(['lonely', 'peer']);
    expect(orphans).not.toContain('leaf');
    expect(orphans).not.toContain('hub');
  });

  it('坏链带出引用来源，便于直接去补链接', async () => {
    const view = await new GraphService(port(fixture())).health();
    const broken = view.issues.find((issue) => issue.kind === 'broken-link');
    expect(broken?.slug).toBe('missing');
    expect(broken?.members).toEqual(['hub']);
  });

  it('枢纽按入链降序，供与孤岛对照', async () => {
    const view = await new GraphService(port(fixture())).health();
    expect(view.hubs[0]).toEqual({ slug: 'leaf', title: '叶子', inDegree: 1 });
  });

  it('数据源不可用时抛错，不假装返回空图', async () => {
    const failing: KnowledgeGraphPort = {
      async load() {
        throw new Error('knowledge-graph-unavailable');
      },
    };
    await expect(new GraphService(failing).health()).rejects.toThrow(
      'knowledge-graph-unavailable',
    );
  });
});
