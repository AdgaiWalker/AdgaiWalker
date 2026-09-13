/**
 * 图谱视图模型 —— 纯函数，无 DOM、无 IO。
 *
 * 把「图标数据 + 四组设置」推导成「该画什么」：可见节点/可见边/分组配色。
 * 语义照抄 Obsidian Graph View（docs/PRD-KNOWLEDGE-GRAPH.md §3），默认值逐项对齐。
 */
import {
  GRAPH_LAYOUT_DEFAULTS,
  evaluateGraphQuery,
  parseGraphQuery,
  type GraphEdge,
  type GraphLayoutParams,
  type GraphNode,
  type GraphQueryDoc,
  type KnowledgeGraph,
} from '@walker/shared';

export type GraphFilters = {
  search: string;
  tags: boolean;
  attachments: boolean;
  existingFilesOnly: boolean;
  orphans: boolean;
};

export type GraphDisplay = {
  arrows: boolean;
  textFadeThreshold: number;
  nodeSize: number;
  linkThickness: number;
};

export type GraphGroup = {
  id: string;
  query: string;
  color: string;
};

export type GraphSettings = {
  filters: GraphFilters;
  groups: GraphGroup[];
  display: GraphDisplay;
  forces: GraphLayoutParams;
};

/** 逐项对齐 Obsidian 默认值（PRD §3.1–§3.4） */
export const GRAPH_DEFAULT_SETTINGS: GraphSettings = {
  filters: {
    search: '',
    tags: true,
    attachments: false,
    existingFilesOnly: false,
    orphans: true,
  },
  groups: [],
  display: {
    arrows: false,
    textFadeThreshold: 0.5,
    nodeSize: 1,
    linkThickness: 1,
  },
  forces: { ...GRAPH_LAYOUT_DEFAULTS },
};

export function createDefaultGraphSettings(): GraphSettings {
  return {
    filters: { ...GRAPH_DEFAULT_SETTINGS.filters },
    groups: [],
    display: { ...GRAPH_DEFAULT_SETTINGS.display },
    forces: { ...GRAPH_DEFAULT_SETTINGS.forces },
  };
}

export const GRAPH_DEFAULT_NODE_COLOR = '#7dd3fc';

/** 分组调色板：站内主题为冷色霜雾，分组色取高辨识度暖色以免与默认色混淆 */
export const GRAPH_GROUP_PALETTE = [
  '#f97316',
  '#a855f7',
  '#22c55e',
  '#ef4444',
  '#eab308',
  '#06b6d4',
] as const;

export function nextGroupColor(groups: readonly GraphGroup[]): string {
  return GRAPH_GROUP_PALETTE[groups.length % GRAPH_GROUP_PALETTE.length]!;
}

/**
 * 面板里**如实**列出已实现的操作符（PRD §8-D7：不实现的不写进帮助文案，不做假承诺）。
 * 与 packages/shared/src/graph-query.ts 的 tokenizer 保持一致。
 */
export const GRAPH_QUERY_HELP: Array<{ syntax: string; description: string }> = [
  { syntax: 'a b', description: '同时包含' },
  { syntax: '"a b"', description: '精确短语' },
  { syntax: 'a OR b', description: '任一命中' },
  { syntax: '-a', description: '排除' },
  { syntax: '(a OR b) c', description: '括号控制优先级' },
  { syntax: 'file:ferry', description: '标题或 slug' },
  { syntax: 'path:content/log', description: '内容路径' },
  { syntax: 'content:差距', description: '正文' },
  { syntax: 'tag:#AI', description: '标签' },
  { syntax: 'line:(a b)', description: '同一行内' },
  { syntax: 'block:(a b)', description: '同一段落内' },
  { syntax: 'section:(a b)', description: '同一标题区间内' },
  { syntax: 'task: / task-todo: / task-done:', description: '任务行' },
  { syntax: '[series:Ferry]', description: 'frontmatter 属性取值' },
  { syntax: '[seriesOrder:<3]', description: '属性数值比较（< 与 >）' },
  { syntax: '[updated:null]', description: '属性存在但为空' },
  { syntax: '/正则/', description: 'JavaScript 风格正则' },
  { syntax: 'match-case:x', description: '区分大小写（默认忽略）' },
];

export function graphQueryDoc(
  node: GraphNode,
  body = '',
  browsePath = '/posts',
): GraphQueryDoc {
  const base = {
    id: node.id,
    kind: node.kind,
    body,
    inDegree: node.inDegree,
    outDegree: node.outDegree,
    totalDegree: node.totalDegree,
    linkDegree: node.linkDegree,
  };
  if (node.kind === 'note') {
    return {
      ...base,
      slug: node.slug,
      title: node.title,
      path: `content/log/${node.slug}.md`,
      tags: node.tags,
      tag: '',
      props: {
        hall: node.hall || null,
        type: node.type || null,
        form: node.form || null,
        domain: node.domain || null,
        series: node.series || null,
        seriesOrder: node.seriesOrder,
        date: node.date || null,
        updated: node.updated || null,
        created: node.created || null,
        tags: node.tags.join(' '),
      },
    };
  }
  if (node.kind === 'ghost') {
    return {
      ...base,
      slug: node.slug,
      title: node.slug,
      path: `content/log/${node.slug}.md`,
      tags: [],
      tag: '',
      props: { exists: null },
    };
  }
  if (node.kind === 'tag') {
    return {
      ...base,
      slug: '',
      title: `#${node.tag}`,
      path: '',
      tags: [node.tag],
      tag: node.tag,
      props: { tag: node.tag },
    };
  }
  return {
    ...base,
    slug: '',
    title: node.path,
    path: node.path,
    tags: [],
    tag: '',
    props: { attachment: node.path },
  };
}

export type GraphViewState = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  colors: Map<string, string>;
  /** 查询语法错误（画布不崩，只在面板上如实提示） */
  queryError: string | null;
};

/**
 * 由设置推导可见图。
 * Orphans 的判定刻意落在**可见边集**上：与 Obsidian 一致——关掉标签后只靠标签连接的笔记
 * 就真的成了孤岛，应当被 Orphans 过滤掉。
 */
export function applyGraphSettings(
  graph: KnowledgeGraph,
  settings: GraphSettings,
  bodies: Readonly<Record<string, string>> = {},
): GraphViewState {
  const { filters } = settings;

  let parsed: ReturnType<typeof parseGraphQuery> | null = null;
  if (filters.search.trim()) {
    parsed = parseGraphQuery(filters.search);
  }

  const docs = new Map<string, GraphQueryDoc>();
  for (const node of graph.nodes) {
    const body = node.kind === 'note' ? (bodies[node.slug] ?? '') : '';
    docs.set(node.id, graphQueryDoc(node, body));
  }

  let visible = graph.nodes.filter((node) => {
    if (node.kind === 'tag') return filters.tags;
    if (node.kind === 'attachment') return filters.attachments;
    if (node.kind === 'ghost') return !filters.existingFilesOnly;
    return true;
  });

  if (parsed) {
    if (parsed.ok) {
      const query = parsed.query;
      visible = visible.filter((node) => {
        const doc = docs.get(node.id);
        return doc ? evaluateGraphQuery(query, doc) : false;
      });
    }
    // 语法错误时不过滤（画布保持可用），错误另行提示
  }

  const visibleIds = new Set(visible.map((node) => node.id));
  let edges = graph.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );

  if (!filters.orphans) {
    const connected = new Set<string>();
    for (const edge of edges) {
      connected.add(edge.source);
      connected.add(edge.target);
    }
    visible = visible.filter(
      (node) => node.kind !== 'note' || connected.has(node.id),
    );
    const stillVisible = new Set(visible.map((node) => node.id));
    edges = edges.filter(
      (edge) => stillVisible.has(edge.source) && stillVisible.has(edge.target),
    );
  }

  // Groups：列表从上到下优先匹配，命中多个取最上面那个
  // 未命中分组的节点不预设颜色：由画布取主题默认色，避免把配色写死在数据层
  const colors = new Map<string, string>();
  const groupQueries = settings.groups.map((group) => ({
    group,
    parsed: group.query.trim() ? parseGraphQuery(group.query) : null,
  }));
  for (const node of visible) {
    const doc = docs.get(node.id)!;
    for (const { group, parsed: groupQuery } of groupQueries) {
      if (!groupQuery) continue;
      if (!groupQuery.ok) continue;
      if (evaluateGraphQuery(groupQuery.query, doc)) {
        colors.set(node.id, group.color);
        break;
      }
    }
  }

  return {
    nodes: visible,
    edges,
    colors,
    queryError: parsed && !parsed.ok ? parsed.error : null,
  };
}

/** hover 高亮：该节点的全部连接（边 + 邻居），其余降透明度而不是删除（照抄 Obsidian） */
export function hoverHighlight(
  edges: readonly GraphEdge[],
  nodeId: string,
): { edges: Set<number>; neighbors: Set<string> } {
  const highlighted = new Set<number>();
  const neighbors = new Set<string>([nodeId]);
  edges.forEach((edge, index) => {
    if (edge.source === nodeId || edge.target === nodeId) {
      highlighted.add(index);
      neighbors.add(edge.source);
      neighbors.add(edge.target);
    }
  });
  return { edges: highlighted, neighbors };
}

/**
 * 边的视觉：Obsidian 里正文内链是唯一的实线；标签/附件边用虚线与更低透明度区分语义。
 * 只返回线型与相对权重，颜色由画布从主题变量取，保证浅色/深色主题都成立。
 */
export function edgeStroke(kind: GraphEdge['kind']): {
  dash: number[];
  widthRatio: number;
  alpha: number;
} {
  switch (kind) {
    case 'tag':
      return { dash: [2, 4], widthRatio: 0.6, alpha: 0.35 };
    case 'attachment':
      return { dash: [6, 4], widthRatio: 0.7, alpha: 0.5 };
    case 'embed':
      return { dash: [8, 5], widthRatio: 0.9, alpha: 0.9 };
    default:
      return { dash: [], widthRatio: 1, alpha: 0.75 };
  }
}

/** 节点半径：Obsidian 口径「被引用越多越大」——入链数为唯一依据 */
export function nodeRadius(
  node: GraphNode,
  display: GraphDisplay,
  base = 6,
): number {
  const weighted = base + Math.sqrt(Math.max(0, node.inDegree)) * 4;
  return weighted * display.nodeSize;
}

export function nodeLabel(node: GraphNode): string {
  if (node.kind === 'note') return node.title;
  if (node.kind === 'tag') return `#${node.tag}`;
  if (node.kind === 'ghost') return node.slug;
  return node.path.split('/').pop() ?? node.path;
}

export function nodeHref(node: GraphNode, browsePath: string): string | null {
  if (node.kind === 'note' || node.kind === 'ghost') {
    return `${browsePath}/${encodeURIComponent(node.slug)}`;
  }
  return null;
}

/** Animate：按 created 升序给出节点出现顺序（Obsidian 的时间流逝） */
export function animateOrder(nodes: readonly GraphNode[]): GraphNode[] {
  return nodes
    .filter((node): node is Extract<GraphNode, { kind: 'note' }> => node.kind === 'note')
    .slice()
    .sort((a, b) => {
      const left = a.created || a.date;
      const right = b.created || b.date;
      if (left === right) return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
      return left < right ? -1 : 1;
    });
}
