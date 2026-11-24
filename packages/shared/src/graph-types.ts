/**
 * 知识图谱核心数据类型与节点 ID 规范（纯类型与纯 ID 函数，无任何内部依赖）。
 */

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
