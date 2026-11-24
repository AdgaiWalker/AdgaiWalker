/**
 * 知识图谱局部邻域与结构体检 —— 纯函数，仅依赖 `./graph-types.js`。
 */
import type {
  GraphEdge,
  GraphNode,
  GraphNoteNode,
  KnowledgeGraph,
} from './graph-types.js';

export function findGraphNode(
  graph: KnowledgeGraph,
  id: string,
): GraphNode | undefined {
  return graph.nodes.find((node) => node.id === id);
}

export type GraphNeighborhood = {
  centerId: string;
  depth: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

/**
 * 局部图（Obsidian Local Graph）：以 nodeId 为中心、按无向邻接展开 depth 层。
 * 无向是刻意的：Obsidian 的局部图同时呈现出链与反向链接。
 */
export function graphNeighbors(
  graph: KnowledgeGraph,
  nodeId: string,
  depth = 1,
): GraphNeighborhood {
  const wantedDepth = Math.max(1, Math.min(5, Math.floor(depth)));
  const center = findGraphNode(graph, nodeId);
  if (!center) return { centerId: nodeId, depth: wantedDepth, nodes: [], edges: [] };

  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source)!.push(edge.target);
    adjacency.get(edge.target)!.push(edge.source);
  }

  const visited = new Set<string>([nodeId]);
  let frontier = [nodeId];
  for (let level = 0; level < wantedDepth; level += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of adjacency.get(id) ?? []) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        next.push(neighbour);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  const nodes = graph.nodes.filter((node) => visited.has(node.id));
  const edges = graph.edges.filter(
    (edge) => visited.has(edge.source) && visited.has(edge.target),
  );
  return { centerId: nodeId, depth: wantedDepth, nodes, edges };
}

export type GraphIssueKind =
  | 'orphan'
  | 'broken-link'
  | 'one-way-link'
  | 'series-without-links'
  | 'attachment-orphan';

export type GraphIssue = {
  kind: GraphIssueKind;
  /** 可点击跳转的节点 id；主题线类问题为空字符串 */
  nodeId: string;
  slug: string;
  title: string;
  detail: string;
  /** 主题线类问题的成员 slug 列表 */
  members?: string[];
};

/**
 * 结构体检（PRD §6.2）——「图给人看形状，清单给人动手」。
 * `orphan` 用 linkDegree（无正文内链）而非 totalDegree，与 Obsidian 的 Orphans 语义刻意区分。
 */
export function computeGraphIssues(
  graph: KnowledgeGraph,
): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const notes = graph.nodes.filter(
    (node): node is GraphNoteNode => node.kind === 'note',
  );
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));

  // 孤岛：正文里没有任何文章互相引用
  for (const note of notes) {
    if (note.linkDegree === 0) {
      issues.push({
        kind: 'orphan',
        nodeId: note.id,
        slug: note.slug,
        title: note.title,
        detail: '正文里没有任何文章互相引用（正文内链 0）',
      });
    }
  }

  // 坏链：被引用但尚不存在的笔记
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'link') continue;
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    const source = byId.get(edge.source);
    incoming.get(edge.target)!.push(source?.kind === 'note' ? source.slug : edge.source);
  }
  for (const node of graph.nodes) {
    if (node.kind !== 'ghost') continue;
    const sources = [...new Set(incoming.get(node.id) ?? [])].sort();
    issues.push({
      kind: 'broken-link',
      nodeId: node.id,
      slug: node.slug,
      title: node.slug,
      detail: sources.length
        ? `被 ${sources.join('、')} 引用，但没有对应文章`
        : '被引用但没有对应文章',
      members: sources,
    });
  }

  // 单向链接：A → B 有边，B → A 无边（按无序对去重，只报一次）
  const linkPairs = new Set(
    graph.edges.filter((edge) => edge.kind === 'link').map((edge) => `${edge.source}\u0000${edge.target}`),
  );
  const reported = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'link') continue;
    const back = `${edge.target}\u0000${edge.source}`;
    if (linkPairs.has(back)) continue;
    const pairKey = [edge.source, edge.target].sort().join('\u0000');
    if (reported.has(pairKey)) continue;
    reported.add(pairKey);
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    issues.push({
      kind: 'one-way-link',
      nodeId: edge.source,
      slug: source.kind === 'note' ? source.slug : '',
      title: source.kind === 'note' ? source.title : edge.source,
      detail: `${source.kind === 'note' ? source.slug : edge.source} → ${
        target.kind === 'note' ? target.slug : edge.target
      } 是单向链接，反向没有回引`,
    });
  }

  // 只有主题线、成员之间没有互引
  const seriesGroups = new Map<string, GraphNoteNode[]>();
  for (const note of notes) {
    const series = note.series.trim();
    if (!series) continue;
    if (!seriesGroups.has(series)) seriesGroups.set(series, []);
    seriesGroups.get(series)!.push(note);
  }
  for (const [series, members] of seriesGroups) {
    if (members.length < 2) continue;
    const ids = new Set(members.map((node) => node.id));
    const hasInternalLink = graph.edges.some(
      (edge) =>
        edge.kind === 'link' && ids.has(edge.source) && ids.has(edge.target),
    );
    if (hasInternalLink) continue;
    issues.push({
      kind: 'series-without-links',
      nodeId: '',
      slug: '',
      title: series,
      detail: `主题线「${series}」的 ${members.length} 篇之间没有任何正文互引`,
      members: members.map((node) => node.slug),
    });
  }

  // 附件孤岛
  for (const node of graph.nodes) {
    if (node.kind !== 'attachment' || node.totalDegree > 0) continue;
    issues.push({
      kind: 'attachment-orphan',
      nodeId: node.id,
      slug: '',
      title: node.path,
      detail: '没有任何正文引用这个附件',
    });
  }

  return issues;
}
