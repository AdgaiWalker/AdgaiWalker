/**
 * 知识图谱模型与推导 —— 纯函数，无 IO。
 *
 * 语义照抄 Obsidian Graph View（权威：docs/PRD-KNOWLEDGE-GRAPH.md）：
 * 圆圈 = 笔记（节点），线 = 正文内部链接（边），被引用越多节点越大。
 * 本文件不引入任何模型推断：图完全来自内容自身的链接结构。
 */
import { wikiLinkPattern } from './content.js';
import {
  GRAPH_DEFAULT_BROWSE_PATH,
  GRAPH_DEFAULT_SEED,
  attachmentNodeId,
  ghostNodeId,
  noteNodeId,
  tagNodeId,
  type GraphAttachmentNode,
  type GraphEdge,
  type GraphEdgeKind,
  type GraphGhostNode,
  type GraphNode,
  type GraphNoteNode,
  type GraphSourceItem,
  type GraphTagNode,
  type KnowledgeGraph,
  type KnowledgeGraphInput,
} from './graph-types.js';

export * from './graph-types.js';
export * from './graph-issues.js';

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

export interface RelatedSlugSource {
  slug: string;
  body?: string;
  related?: readonly string[];
}

/**
 * 推导单篇文章的关联文章 slug 列表（网状关联唯一真源）：
 * 按「正文出链 → 其他文章的反向入链 → 存量 related 兼容项」顺序聚合去重，
 * 过滤不存在的 slug、自环与指定排除项（如已展示的上下篇）。
 */
export function deriveRelatedSlugs(
  items: readonly RelatedSlugSource[],
  slug: string,
  options?: { browsePath?: string; excludeSlugs?: ReadonlySet<string> },
): string[] {
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  const current = bySlug.get(slug);
  if (!current) return [];

  const browsePath = options?.browsePath ?? GRAPH_DEFAULT_BROWSE_PATH;
  const exclude = options?.excludeSlugs;
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (candidate: string): void => {
    const key = candidate.trim();
    if (!key || key === slug || seen.has(key) || !bySlug.has(key) || exclude?.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  if (current.body) {
    for (const target of extractBodyLinks(current.body, { browsePath }).notes) {
      push(target);
    }
  }

  for (const other of items) {
    if (other.slug === slug || !other.body) continue;
    const links = extractBodyLinks(other.body, { browsePath });
    if (links.notes.some((target) => target.trim() === slug)) {
      push(other.slug);
    }
  }

  for (const ref of current.related ?? []) {
    push(ref);
  }

  return out;
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
