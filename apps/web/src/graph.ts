/**
 * 图谱数据门面 — 绑定 gen 产物，向页面暴露知识图谱与查询所需的正文索引。
 * 运行时只读 `generated/graph.json`（禁止在 web 里做 fs / 直连内容目录）。
 * 产物契约见 docs/PRD-KNOWLEDGE-GRAPH.md §5.1。
 */
import type { KnowledgeGraph } from '@walker/shared';
import graphData from './generated/graph.json';
import { getAllItems } from './content';

const graph = graphData as unknown as KnowledgeGraph;

export function getKnowledgeGraph(): KnowledgeGraph {
  return graph;
}

/** slug → 正文：查询语法的 content/line/block/section/task 需要正文才能求值 */
export function getGraphBodies(): Record<string, string> {
  const bodies: Record<string, string> = {};
  for (const item of getAllItems()) bodies[item.slug] = item.body;
  return bodies;
}

export function getGraphNodeCounts(): Record<string, number> {
  return graph.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.kind] = (acc[node.kind] ?? 0) + 1;
    return acc;
  }, {});
}
