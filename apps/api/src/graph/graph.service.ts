/**
 * 图谱结构体检（站主面）。
 *
 * 「图给人看形状，清单给人动手」：这里只产出可点击的清单，不做第二张图。
 * 判定全部复用 shared 的 computeGraphIssues，保证与访客面、机器面同一口径。
 */
import { Inject, Injectable } from '@nestjs/common';
import { computeGraphIssues, type GraphIssue } from '@walker/shared';
import {
  KNOWLEDGE_GRAPH,
  type KnowledgeGraphPort,
} from '../ports/knowledge-graph.port';

export type GraphHealthView = {
  generatedAt: string;
  nodeCounts: Record<string, number>;
  edgeCounts: Record<string, number>;
  issueCounts: Record<string, number>;
  issues: GraphIssue[];
  /** 被引用最多的枢纽（in-degree），用于与孤岛对照 */
  hubs: Array<{ slug: string; title: string; inDegree: number }>;
  /** 让「内容缺链」这件事有明确分母 */
  totals: {
    notes: number;
    linkEdges: number;
    isolatedNotes: number;
  };
};

function tally(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

@Injectable()
export class GraphService {
  constructor(
    @Inject(KNOWLEDGE_GRAPH) private readonly graphs: KnowledgeGraphPort,
  ) {}

  async health(): Promise<GraphHealthView> {
    const graph = await this.graphs.load();
    const issues = computeGraphIssues(graph);
    const notes = graph.nodes.filter((node) => node.kind === 'note');
    const linkEdges = graph.edges.filter((edge) => edge.kind === 'link');

    const hubs = notes
      .filter((node) => node.inDegree > 0)
      .map((node) => ({ slug: node.slug, title: node.title, inDegree: node.inDegree }))
      .sort((a, b) => b.inDegree - a.inDegree || (a.slug < b.slug ? -1 : 1))
      .slice(0, 10);

    const isolated = issues.filter((issue) => issue.kind === 'orphan');

    return {
      generatedAt: graph.generatedAt,
      nodeCounts: tally(graph.nodes.map((node) => node.kind)),
      edgeCounts: tally(graph.edges.map((edge) => edge.kind)),
      issueCounts: tally(issues.map((issue) => issue.kind)),
      issues,
      hubs,
      totals: {
        notes: notes.length,
        linkEdges: linkEdges.length,
        isolatedNotes: isolated.length,
      },
    };
  }
}
