/**
 * 知识图谱模型与推导 —— 纯函数，无 IO。
 *
 * 语义照抄 Obsidian Graph View（权威：docs/PRD-KNOWLEDGE-GRAPH.md）：
 * 圆圈 = 笔记（节点），线 = 正文内部链接（边），被引用越多节点越大。
 * 本文件不引入任何模型推断：图完全来自内容自身的链接结构。
 */
import { wikiLinkPattern } from './content.js';

export type GraphNodeKind = 'note' | 'ghost' | 'tag' | 'attachment';
export type GraphEdgeKind = 'link' | 'tag' | 'attachment' | 'embed';

export const GRAPH_DEFAULT_SEED = 20260914;
export const GRAPH_DEFAULT_BROWSE_PATH = '/posts';

export function noteNodeId(slug: string): string {
  return `note:${slug}`;
}
export function ghostNodeId(slug: string): string {
  return `ghost:${slug}`;
}
export function tagNodeId(tag: string): string {
  return `tag:${tag}`;
}
export function attachmentNodeId(path: string): string {
  return `attachment:${path}`;
}

type GraphNodeBase = {
  id: string;
  kind: GraphNodeKind;
  /** 全类型边度数（含 tag / attachment）—— Obsidian Orphans 过滤器的依据 */
  totalDegree: number;
  /** 仅『正文内链』边度数 —— 站主「孤岛」体检的依据（PRD §6.2），两者语义不同不可混用 */
  linkDegree: number;
  inDegree: number;
  outDegree: number;
};

export type GraphNoteNode = GraphNodeBase & {
  kind: 'note';
  slug: string;
  title: string;
  date: string;
  updated: string;
  /** Obsidian Animate 的排序依据；取自 Git 首次提交时间，缺失时回落 date */
  created: string;
  hall: string;
  type: string;
  form: string;
  domain: string;
  series: string;
  seriesOrder: number | null;
  tags: string[];
  summary: string;
};

export type GraphGhostNode = GraphNodeBase & {
  kind: 'ghost';
  slug: string;
};

export type GraphTagNode = GraphNodeBase & {
  kind: 'tag';
  tag: string;
};

export type GraphAttachmentNode = GraphNodeBase & {
  kind: 'attachment';
  path: string;
};

export type GraphNode =
  | GraphNoteNode
  | GraphGhostNode
  | GraphTagNode
  | GraphAttachmentNode;

export type GraphEdge = {
  source: string;
  target: string;
  kind: GraphEdgeKind;
};

export type KnowledgeGraph = {
  generatedAt: string;
  /** 布局随机种子：同输入必须产出同布局（PRD §3.4 确定性要求） */
  seed: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type GraphSourceItem = {
  slug: string;
  title: string;
  date: string;
  updated?: string;
  created?: string;
  hall?: string;
  type?: string;
  form?: string;
  domain?: string;
  series?: string;
  seriesOrder?: number | null;
  tags?: readonly string[];
  summary?: string;
  body: string;
};

export type KnowledgeGraphInput = {
  items: readonly GraphSourceItem[];
  /** content/log 下的非 md 文件路径（相对路径或文件名），Obsidian 的 attachment 节点 */
  attachments?: readonly string[];
  /** 站内文章路由前缀：识别 `[text](/posts/slug)` 形式的库内链接 */
  browsePath?: string;
  now?: string;
  seed?: number;
};

/**
 * `slug#heading` / `slug^block` → `slug`。
 * PRD 偏离 D3：现有解析器不支持锚点，锚点级链接按整篇建边。
 */
export function stripLinkAnchor(raw: string): string {
  const trimmed = raw.trim();
  const cut = trimmed.search(/[#^]/);
  return cut === -1 ? trimmed : trimmed.slice(0, cut).trim();
}

function basename(target: string): string {
  const parts = target.split('/');
  return parts[parts.length - 1] ?? target;
}

/**
 * 把站内 markdown 链接的 href 解析为库内笔记 slug；不是库内笔记则返回 null。
 * 与 Obsidian 一致：外链、锚点、站内路由（如 /tools/resources）都不是边。
 */
export function resolveVaultHref(
  href: string,
  browsePath: string = GRAPH_DEFAULT_BROWSE_PATH,
): string | null {
  const clean = href.split('#')[0]!.split('?')[0]!.trim();
  if (!clean) return null;
  // 带协议（http: / https: / mailto: …）或协议相对 //host 一律不算库内链接
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith('//')) return null;
  const base = browsePath.replace(/\/$/, '');
  if (base && clean.startsWith(`${base}/`)) {
    const slug = decodeURIComponent(clean.slice(base.length + 1)).replace(/\/+$/, '');
    return slug || null;
  }
  if (/\.(md|mdx)$/i.test(clean) && !clean.includes('/')) {
    return clean.replace(/\.(md|mdx)$/i, '');
  }
  return null;
}

export type ExtractedLinks = {
  /** 指向笔记 slug 的目标（wiki 链接 + 库内 markdown 链接） */
  notes: string[];
  /** 指向附件路径的引用（命中附件集合的 wiki 链接 / 内嵌 / markdown 图片链接） */
  attachments: string[];
};

export type ExtractLinkOptions = {
  browsePath?: string;
  /** 附件集合：完整路径与文件名都可命中 */
  attachments?: ReadonlyMap<string, string>;
};

/**
 * 抽取一条正文里的全部库内链接目标（PRD §2.1 的边来源）。
 * 外链、站内路由、纯锚点一律不产出目标。
 */
export function extractBodyLinks(
  body: string,
  options: ExtractLinkOptions = {},
): ExtractedLinks {
  const browsePath = options.browsePath ?? GRAPH_DEFAULT_BROWSE_PATH;
  const attachments = options.attachments;
  const notes: string[] = [];
  const attachmentRefs: string[] = [];

  const matchAttachment = (candidate: string): string | null =>
    attachments?.get(candidate) ?? attachments?.get(basename(candidate)) ?? null;

  // 1) wiki 链接：[[slug]] / [[slug|label]] / ![[slug]]
  for (const match of body.matchAll(wikiLinkPattern())) {
    const target = stripLinkAnchor(match[1] ?? '');
    if (!target) continue;
    const attachment = matchAttachment(target);
    if (attachment) {
      attachmentRefs.push(attachment);
      continue;
    }
    notes.push(target);
  }

  // 2) markdown 链接 / 图片嵌入：[text](target) / ![alt](target)
  for (const match of body.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const href = (match[1] ?? '').trim();
    if (!href || href.startsWith('#')) continue;
    const slug = resolveVaultHref(href, browsePath);
    if (slug) {
      notes.push(slug);
      continue;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue;
    const attachment = matchAttachment(decodeURIComponent(href));
    if (attachment) attachmentRefs.push(attachment);
  }

  return { notes, attachments: attachmentRefs };
}

/**
 * 由公开内容条目构建知识图谱。
 *
 * 不变式（PRD §5.1）：节点 id 全局唯一 / 无自环 / 同 (source,target,kind) 去重 /
 * 幽灵节点 slug 不与任何 note 冲突 / 只接收公开条目（调用方负责只传公开内容）。
 */
export function buildKnowledgeGraph(
  input: KnowledgeGraphInput,
): KnowledgeGraph {
  const browsePath = input.browsePath ?? GRAPH_DEFAULT_BROWSE_PATH;

  const attachmentSet = new Map<string, string>();
  for (const path of input.attachments ?? []) {
    attachmentSet.set(path, path);
    attachmentSet.set(basename(path), path);
  }

  // slug 去重：id 唯一是硬不变式，重复 slug 只保留首个
  const items: GraphSourceItem[] = [];
  const bySlug = new Map<string, GraphSourceItem>();
  for (const item of input.items) {
    const slug = item.slug?.trim();
    if (!slug || bySlug.has(slug)) continue;
    const normalized: GraphSourceItem = { ...item, slug };
    bySlug.set(slug, normalized);
    items.push(normalized);
  }

  const notes = new Map<string, GraphNoteNode>();
  const ghosts = new Map<string, GraphGhostNode>();
  const tags = new Map<string, GraphTagNode>();
  const attachmentNodes = new Map<string, GraphAttachmentNode>();
  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  const pushEdge = (source: string, target: string, kind: GraphEdgeKind): void => {
    if (source === target) return; // 无自环
    const key = `${source}\u0000${target}\u0000${kind}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push({ source, target, kind });
  };

  const ensureNote = (item: GraphSourceItem): GraphNoteNode => {
    const existing = notes.get(item.slug);
    if (existing) return existing;
    const node: GraphNoteNode = {
      id: noteNodeId(item.slug),
      kind: 'note',
      slug: item.slug,
      title: item.title || item.slug,
      date: item.date ?? '',
      updated: item.updated ?? '',
      created: item.created || item.date || '',
      hall: item.hall ?? '',
      type: item.type ?? '',
      form: item.form ?? '',
      domain: item.domain ?? '',
      series: item.series ?? '',
      seriesOrder: item.seriesOrder ?? null,
      tags: (item.tags ?? []).map((t) => t.trim()).filter(Boolean),
      summary: item.summary ?? '',
      totalDegree: 0,
      linkDegree: 0,
      inDegree: 0,
      outDegree: 0,
    };
    notes.set(item.slug, node);
    return node;
  };

  const ensureGhost = (slug: string): GraphGhostNode => {
    const existing = ghosts.get(slug);
    if (existing) return existing;
    const node: GraphGhostNode = {
      id: ghostNodeId(slug),
      kind: 'ghost',
      slug,
      totalDegree: 0,
      linkDegree: 0,
      inDegree: 0,
      outDegree: 0,
    };
    ghosts.set(slug, node);
    return node;
  };

  const ensureTag = (tag: string): GraphTagNode => {
    const existing = tags.get(tag);
    if (existing) return existing;
    const node: GraphTagNode = {
      id: tagNodeId(tag),
      kind: 'tag',
      tag,
      totalDegree: 0,
      linkDegree: 0,
      inDegree: 0,
      outDegree: 0,
    };
    tags.set(tag, node);
    return node;
  };

  const ensureAttachment = (path: string): GraphAttachmentNode => {
    const existing = attachmentNodes.get(path);
    if (existing) return existing;
    const node: GraphAttachmentNode = {
      id: attachmentNodeId(path),
      kind: 'attachment',
      path,
      totalDegree: 0,
      linkDegree: 0,
      inDegree: 0,
      outDegree: 0,
    };
    attachmentNodes.set(path, node);
    return node;
  };

  // Pass 1：先建全部笔记节点，保证后续建边时目标节点已存在（避免幽灵/笔记判定顺序依赖）
  for (const item of items) ensureNote(item);

  // Pass 2：正文内链（唯一的『边』来源，照抄 Obsidian）
  for (const item of items) {
    const source = noteNodeId(item.slug);
    const links = extractBodyLinks(item.body, {
      browsePath,
      attachments: attachmentSet,
    });
    for (const target of links.notes) {
      if (target === item.slug) continue; // 自环跳过
      const targetId = bySlug.has(target)
        ? ensureNote(bySlug.get(target)!).id
        : ensureGhost(target).id;
      pushEdge(source, targetId, 'link');
    }
    for (const attachment of links.attachments) {
      pushEdge(source, ensureAttachment(attachment).id, 'attachment');
    }
  }

  // Pass 3：标签节点与笔记→标签边（Obsidian 的 Tags）
  for (const item of items) {
    const source = noteNodeId(item.slug);
    for (const tag of (item.tags ?? []).map((t) => t.trim()).filter(Boolean)) {
      pushEdge(source, ensureTag(tag).id, 'tag');
    }
  }

  // Pass 4：附件节点全量存在（含零引用者——它们是真实的孤岛，不能被静默丢掉）
  for (const path of attachmentSet.values()) ensureAttachment(path);

  // Pass 5：度数
  const all = new Map<string, GraphNode>();
  for (const node of notes.values()) all.set(node.id, node);
  for (const node of ghosts.values()) all.set(node.id, node);
  for (const node of tags.values()) all.set(node.id, node);
  for (const node of attachmentNodes.values()) all.set(node.id, node);

  for (const edge of edges) {
    const source = all.get(edge.source);
    const target = all.get(edge.target);
    if (source) {
      source.outDegree += 1;
      source.totalDegree += 1;
    }
    if (target) {
      target.inDegree += 1;
      target.totalDegree += 1;
    }
    if (edge.kind === 'link') {
      if (source) source.linkDegree += 1;
      if (target) target.linkDegree += 1;
    }
  }

  const byId = (a: GraphNode, b: GraphNode) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const nodes: GraphNode[] = [
    ...notes.values(),
    ...[...ghosts.values()].sort(byId),
    ...[...tags.values()].sort(byId),
    ...[...attachmentNodes.values()].sort(byId),
  ];

  return {
    generatedAt: input.now ?? new Date().toISOString(),
    seed: input.seed ?? GRAPH_DEFAULT_SEED,
    nodes,
    edges,
  };
}

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
