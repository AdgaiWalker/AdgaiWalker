/**
 * 图谱视图模型 —— 纯函数，无 DOM、无 IO。
 *
 * 把「图数据 + 四组设置」推导成「该画什么」：可见节点/可见边/分组配色/查询文档。
 * 设置项的**默认值与底层参数名全部对齐 Obsidian 源码**（见 obsidian/constants.ts 的来源说明）：
 *   Filters  : Search / Tags / Attachments / Existing files only / Orphans
 *   Groups   : 搜索查询 + 颜色
 *   Display  : Arrows / Text fade threshold / Node size / Link thickness
 *   Forces   : Center force / Repel force / Link force / Link distance
 *
 * ## 领域接缝（v1.5，为代码架构图谱而抽）
 * 本文件对节点只要求 `GraphViewNode` 那几个字段，**不再假设节点来自内容图谱**。
 * 各领域的差异（标签怎么取、检索文档怎么投影、点节点做什么、正文从哪来）
 * 收在 `GraphDomain` 里，由调用方给出（见 domains.ts 的两个实现）。
 * 这样引擎与视图层零改动即可同时驱动内容图谱与代码图谱 ——
 * 后者节点契约里根本没有 `slug`/`hall`/`series` 这些内容字段。
 */
import {
  evaluateGraphQuery,
  parseGraphQuery,
  type GraphNode,
  type GraphNodeKind,
  type GraphNoteNode,
  type GraphQueryDoc,
} from '@walker/shared';
import {
  DEFAULT_CENTER_STRENGTH,
  DEFAULT_LINK_DISTANCE,
  DEFAULT_LINK_STRENGTH,
  DEFAULT_REPEL_STRENGTH,
  LINE_SIZE_MULTIPLIER,
  NODE_SIZE_MULTIPLIER,
  SHOW_ARROW,
  TEXT_FADE_MULTIPLIER,
} from './obsidian/constants';

export type GraphFilters = {
  search: string;
  tags: boolean;
  attachments: boolean;
  existingFilesOnly: boolean;
  orphans: boolean;
};

export type GraphDisplay = {
  /** 应用选项名 `showArrow` */
  showArrow: boolean;
  /** 应用选项名 `textFadeMultiplier`（Text fade threshold），默认 0 */
  textFadeMultiplier: number;
  /** 应用选项名 `nodeSizeMultiplier`（Node size），默认 1 */
  nodeSizeMultiplier: number;
  /** 应用选项名 `lineSizeMultiplier`（Link thickness），默认 1 */
  lineSizeMultiplier: number;
};

/** 局部图设置（应用：localJumps / localForelinks / localBacklinks / localInterlinks） */
export type GraphLocalSettings = {
  /** 应用选项名 `localJumps`，区间 [1,5] */
  depth: number;
  /** 应用选项名 `localForelinks`：沿出链展开 */
  forelinks: boolean;
  /** 应用选项名 `localBacklinks`：沿反向链接展开 */
  backlinks: boolean;
  /**
   * 应用选项名 `localInterlinks`，官方中文「其他节点间的链接」，默认关。
   * 关闭时只画**遍历用到的边**（从中心逐层走出来的那些），
   * 打开时把邻域节点之间**其余**的连线也画出来（官方原文：显示其他节点之间的链接）。
   */
  interlinks: boolean;
};

/**
 * 颜色组。官方中文说明是「点击可更改颜色 · 拖动可对颜色组排序」（zh.txt:1267），
 * 即**取色器 + 拖拽排序**——CSS 里的 `.color-fill-1..6` 只是默认主题给出的六个初值，
 * 不是可选集合。v1.2 曾据 CSS 推断成「固定 6 色槽」，v1.3 依官方文案更正。
 */
export type GraphGroup = {
  id: string;
  query: string;
  color: string;
};

/** Forces 四项，字段名与 worker 的 `forces` 消息逐字对应 */
export type GraphForceSettings = {
  centerStrength: number;
  repelStrength: number;
  linkStrength: number;
  linkDistance: number;
};

export type GraphSettings = {
  filters: GraphFilters;
  groups: GraphGroup[];
  display: GraphDisplay;
  forces: GraphForceSettings;
  local: GraphLocalSettings;
};

/**
 * 逐项对齐**应用本体**（`app.js` 的 `wQ` 过滤器 / `PJ` 显示 / `IJ` 力）。
 * 注意：应用 `showTags` 默认为 **false**（帮助文档未说明默认值，早期版本按「开」实现，已更正）。
 */
export const GRAPH_DEFAULT_SETTINGS: GraphSettings = {
  filters: {
    search: '',
    tags: false,
    attachments: false,
    existingFilesOnly: false,
    orphans: true,
  },
  groups: [],
  display: {
    showArrow: SHOW_ARROW,
    textFadeMultiplier: TEXT_FADE_MULTIPLIER,
    nodeSizeMultiplier: NODE_SIZE_MULTIPLIER,
    lineSizeMultiplier: LINE_SIZE_MULTIPLIER,
  },
  forces: {
    centerStrength: DEFAULT_CENTER_STRENGTH,
    repelStrength: DEFAULT_REPEL_STRENGTH,
    linkStrength: DEFAULT_LINK_STRENGTH,
    linkDistance: DEFAULT_LINK_DISTANCE,
  },
  local: {
    depth: 1,
    forelinks: true,
    backlinks: true,
    interlinks: false,
  },
};

export function createDefaultGraphSettings(): GraphSettings {
  return {
    filters: { ...GRAPH_DEFAULT_SETTINGS.filters },
    groups: [],
    display: { ...GRAPH_DEFAULT_SETTINGS.display },
    forces: { ...GRAPH_DEFAULT_SETTINGS.forces },
    local: { ...GRAPH_DEFAULT_SETTINGS.local },
  };
}

/** 新建颜色组的初值：取自应用默认主题 `.color-fill-1..6` 的六个槽 */
export const GRAPH_GROUP_PALETTE = [
  '#f97316',
  '#a855f7',
  '#16a34a',
  '#dc2626',
  '#ca8a04',
  '#0891b2',
] as const;

export function nextGroupColor(groups: readonly GraphGroup[]): string {
  return GRAPH_GROUP_PALETTE[groups.length % GRAPH_GROUP_PALETTE.length]!;
}

/**
 * 面板里**如实**列出已实现的操作符（不实现的不写进帮助文案）。
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

// ---------------------------------------------------------------- 领域接缝

/** 视图层与引擎只要求节点具备这些字段（内容图谱与代码图谱都满足） */
export type GraphViewNode = {
  id: string;
  kind: GraphNodeKind;
  inDegree: number;
  outDegree: number;
  totalDegree: number;
  linkDegree: number;
};

export type GraphViewEdge = { source: string; target: string };

export type GraphViewData<Node extends GraphViewNode> = {
  nodes: readonly Node[];
  edges: readonly GraphViewEdge[];
  /** 布局随机种子：同数据必须同布局 */
  seed: number;
};

/** 面板里如实列出的可用检索式（各领域能用的操作符不同，不写没实现的那几条） */
export type GraphQueryHelp = Array<{ syntax: string; description: string }>;

/** 节点在界面上的呈现方式：叫它什么、点了去哪、复制什么 */
export type GraphNodeView<Node extends GraphViewNode> = {
  label(node: Node): string;
  /** 可跳转地址；null = 菜单里不出现「在新标签打开」 */
  href(node: Node): string | null;
  /** 复制链接的文本；缺省用 `href ?? label` */
  copyText?(node: Node): string;
};

export type GraphActivateOps = {
  /** 把查询串写进筛选框（点标签 / 「以它为起点筛选」用） */
  setSearch(query: string): void;
};

/**
 * 一个图谱领域要回答的全部差异。
 * 视图层只认这个接口，不认识「内容」或「代码」—— 这是引擎能零改动复用的原因。
 */
export type GraphDomain<Node extends GraphViewNode> = GraphNodeView<Node> & {
  /** 节点 → 检索文档（正文从哪来由领域自己决定） */
  queryDoc(node: Node): GraphQueryDoc;
  /** Animate 的出现顺序（按时间升序） */
  order(nodes: readonly Node[]): Node[];
  /** 点击节点 */
  activate(node: Node, ops: GraphActivateOps): void;
  /** 右键「以它为起点筛选」 */
  filterFrom(node: Node, ops: GraphActivateOps): void;
  queryHelp: GraphQueryHelp;
};

export type GraphViewState<Node extends GraphViewNode = GraphNode> = {
  nodes: Node[];
  edges: GraphViewEdge[];
  /** 命中颜色组的节点 → 颜色；未命中者不在表内（由引擎取类型语义色） */
  colors: Map<string, string>;
  /** 查询语法错误（画布不崩，只在面板上如实提示） */
  queryError: string | null;
};

/**
 * 由设置推导可见图。
 * Orphans 的判定落在**可见边集**上：与 Obsidian 一致——关掉标签后只靠标签连接的
 * 笔记就真的成了孤岛，应当被 Orphans 过滤掉。
 */
export function applyGraphSettings<Node extends GraphViewNode>(
  graph: GraphViewData<Node>,
  settings: GraphSettings,
  domain: GraphDomain<Node>,
): GraphViewState<Node> {
  const { filters } = settings;

  let parsed: ReturnType<typeof parseGraphQuery> | null = null;
  if (filters.search.trim()) parsed = parseGraphQuery(filters.search);

  const docs = new Map<string, GraphQueryDoc>();
  for (const node of graph.nodes) docs.set(node.id, domain.queryDoc(node));

  let visible = graph.nodes.filter((node) => {
    if (node.kind === 'tag') return filters.tags;
    if (node.kind === 'attachment') return filters.attachments;
    if (node.kind === 'ghost') return !filters.existingFilesOnly;
    return true;
  });

  if (parsed?.ok) {
    const query = parsed.query;
    visible = visible.filter((node) => {
      const doc = docs.get(node.id);
      return doc ? evaluateGraphQuery(query, doc) : false;
    });
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
    visible = visible.filter((node) => node.kind !== 'note' || connected.has(node.id));
    const stillVisible = new Set(visible.map((node) => node.id));
    edges = edges.filter(
      (edge) => stillVisible.has(edge.source) && stillVisible.has(edge.target),
    );
  }

  // 颜色组：列表从上到下优先匹配；未命中者不预设颜色（由引擎取类型语义色）
  const colors = new Map<string, string>();
  const groupQueries = settings.groups.map((group) => ({
    group,
    parsed: group.query.trim() ? parseGraphQuery(group.query) : null,
  }));
  for (const node of visible) {
    const doc = docs.get(node.id)!;
    for (const { group, parsed: groupQuery } of groupQueries) {
      if (!groupQuery?.ok) continue;
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

/**
 * 局部关系图邻域（应用：`localJumps` + 正向/反向链接 + 其他节点间的链接）。
 *
 * 与 shared 的 `graphNeighbors` 的区别：可按方向展开，并可控制「其他节点间的链接」。
 * `interlinks` 关闭（应用默认）时**只保留逐层走出来用到的边**，
 * 打开时把邻域节点之间其余的连线也一并画出——对应官方文案「显示其他节点之间的链接」。
 */
export function localNeighborhood<Node extends GraphViewNode>(
  graph: GraphViewData<Node>,
  centerId: string,
  local: GraphLocalSettings,
): { nodes: Node[]; edges: GraphViewEdge[] } {
  const depth = Math.max(1, Math.min(5, Math.floor(local.depth)));
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!byId.has(centerId)) return { nodes: [], edges: [] };

  const visited = new Set<string>([centerId]);
  /** 逐层遍历实际用到的边（无向去重后的键） */
  const edgeKey = (edge: GraphViewEdge) =>
    edge.source < edge.target
      ? `${edge.source}\u0000${edge.target}`
      : `${edge.target}\u0000${edge.source}`;
  const traversed = new Set<string>();

  let frontier = [centerId];
  for (let level = 0; level < depth; level += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of graph.edges) {
        let neighbour: string | null = null;
        if (local.forelinks && edge.source === id) neighbour = edge.target;
        else if (local.backlinks && edge.target === id) neighbour = edge.source;
        if (!neighbour) continue;
        // 这一层的出边算「走出来的路」，无论对面是否已访问过
        traversed.add(edgeKey(edge));
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        next.push(neighbour);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  return {
    nodes: graph.nodes.filter((node) => visited.has(node.id)),
    edges: graph.edges.filter((edge) => {
      if (!visited.has(edge.source) || !visited.has(edge.target)) return false;
      if (local.interlinks) return true;
      return traversed.has(edgeKey(edge));
    }),
  };
}

export function nodeLabel(node: GraphNode): string {
  if (node.kind === 'note') return node.title;
  if (node.kind === 'tag') return `#${node.tag}`;
  if (node.kind === 'ghost') return node.slug;
  return node.path.split('/').pop() ?? node.path;
}

/** Animate：按 created 升序给出笔记的出现顺序 */
export function animateOrder(nodes: readonly GraphNode[]): GraphNoteNode[] {
  return nodes
    .filter((node): node is GraphNoteNode => node.kind === 'note')
    .slice()
    .sort((a, b) => {
      const left = a.created || a.date;
      const right = b.created || b.date;
      if (left === right) return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
      return left < right ? -1 : 1;
    });
}
