/**
 * 图谱领域的两个实现 —— 视图层与引擎只认 `GraphDomain`，不认识「内容」或「代码」。
 *
 * 内容图谱（`/graph` 与文章页局部图）与代码结构图谱（`/architecture`）
 * 在交互上**刻意保持一致**（站主要求「跟 Obsidian 一模一样」），
 * 差异只有四处：叫它什么、点了去哪、检索文档怎么投影、哪些操作符可用。
 * 把这四处收在这里，是为了让「观感一致」变成结构上的必然，而不是靠两边各写一遍。
 */
import {
  type CodeFileNode,
  type CodeGraphNode,
  type GraphNode,
  type GraphQueryDoc,
} from '@walker/shared';
import {
  GRAPH_QUERY_HELP,
  animateOrder,
  graphQueryDoc,
  nodeLabel,
  type GraphActivateOps,
  type GraphDomain,
  type GraphQueryHelp,
} from './graph-view-model';

function fileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] ?? path;
}

/**
 * 内容图谱领域。
 *
 * `bodies`（正文）在这里闭包进来 —— 检索语法的 `content:` / `line:` / `block:`
 * 作用在正文上，而正文只在内容侧才有。
 */
export function createContentGraphDomain(options: {
  browsePath: string;
  bodies: Readonly<Record<string, string>>;
  navigate: (href: string) => void;
}): GraphDomain<GraphNode> {
  const { browsePath, bodies, navigate } = options;

  const bodyOf = (node: GraphNode): string =>
    node.kind === 'note' ? (bodies[node.slug] ?? '') : '';

  const hrefOf = (node: GraphNode): string | null =>
    node.kind === 'note' || node.kind === 'ghost'
      ? `${browsePath}/${encodeURIComponent(node.slug)}`
      : null;

  /** 把一个节点写成一条能精确指向它的查询串 */
  const queryFor = (node: GraphNode): string => {
    if (node.kind === 'tag') return `tag:#${node.tag}`;
    if (node.kind === 'attachment') return fileName(node.path);
    return graphQueryDoc(node, bodyOf(node)).slug;
  };

  return {
    queryDoc: (node) => graphQueryDoc(node, bodyOf(node)),
    label: nodeLabel,
    href: hrefOf,
    order: animateOrder,
    activate: (node, ops: GraphActivateOps) => {
      const href = hrefOf(node);
      // 有站内页面的（笔记 / 幽灵）直接跳过去；标签与附件没有页面，改为写进筛选框
      if (href) {
        navigate(href);
        return;
      }
      ops.setSearch(queryFor(node));
    },
    filterFrom: (node, ops) => ops.setSearch(queryFor(node)),
    queryHelp: GRAPH_QUERY_HELP,
  };
}

/** Animate：按 git 首次提交时间升序（与内容图谱同一依据），无时间的排在最后 */
export function codeAnimateOrder(nodes: readonly CodeGraphNode[]): CodeFileNode[] {
  return nodes
    .filter((node): node is CodeFileNode => node.kind === 'note')
    .slice()
    .sort((a, b) => {
      const left = a.created;
      const right = b.created;
      if (left === right) return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
      if (!left) return 1;
      if (!right) return -1;
      return left < right ? -1 : 1;
    });
}

/**
 * 代码节点的检索文档投影。
 *
 * 映射关系（决定了面板里哪些检索式真的有用）：
 * - `slug` = 仓库相对路径 → 裸词、`file:` 都能按路径命中（代码的「身份」就是路径）
 * - `title` = 展示标签（`App`、`walker.css`）
 * - `path` = 仓库相对路径 → `path:apps/web/src` 成立
 * - `tags` = 文件类型（`.ts` / `.css` …）→ `tag:.ts` 成立
 * - `props` = app / extension / lines / created / 度数 → `[lines:>500]`、`[app:apps/api]` 成立
 * - `body` 恒为空：**产物不含文件正文**（公开面边界），故 `content:` 一类作用在正文上的操作符
 *   在代码图谱里没有意义，面板的检索式帮助里如实标注
 */
export function codeQueryDoc(node: CodeGraphNode): GraphQueryDoc {
  const base = { id: node.id, kind: node.kind, body: '' };
  if (node.kind === 'tag') {
    return {
      ...base,
      slug: '',
      title: node.label,
      path: '',
      tags: [node.tag],
      tag: node.tag,
      props: {},
    };
  }
  if (node.kind === 'ghost') {
    return {
      ...base,
      slug: node.specifier,
      title: node.label,
      path: '',
      tags: [],
      tag: '',
      props: { unresolved: node.specifier },
    };
  }
  return {
    ...base,
    slug: node.path,
    title: node.label,
    path: node.path,
    tags: node.extension ? [node.extension] : [],
    tag: '',
    props: {
      app: node.app,
      extension: node.extension || null,
      lines: node.lines,
      created: node.created || null,
      inDegree: node.inDegree,
      outDegree: node.outDegree,
      linkDegree: node.linkDegree,
    },
  };
}

/** 代码图谱可用的检索式（只列真的能用的；正文类操作符如实标注不适用） */
export const CODE_GRAPH_QUERY_HELP: GraphQueryHelp = [
  { syntax: 'a b', description: '同时包含' },
  { syntax: '"a b"', description: '精确短语' },
  { syntax: 'a OR b', description: '任一命中' },
  { syntax: '-a', description: '排除' },
  { syntax: '(a OR b) c', description: '括号控制优先级' },
  { syntax: 'file:engine', description: '文件名或路径' },
  { syntax: 'path:apps/web/src', description: '仓库相对路径' },
  { syntax: 'tag:.tsx', description: '文件类型' },
  { syntax: '[app:apps/api]', description: '所属工作区单元' },
  { syntax: '[lines:>500]', description: '行数比较（< 与 >）' },
  { syntax: '[created:null]', description: '属性存在但为空' },
  { syntax: '/正则/', description: 'JavaScript 风格正则' },
  { syntax: 'match-case:x', description: '区分大小写（默认忽略）' },
  {
    syntax: 'content: / line: / block: / section: / task*',
    description: '不适用：产物不含文件正文，这几条不会命中',
  },
];

/**
 * 代码结构图谱领域。
 *
 * 代码文件没有站内页面可跳，所以 `href` 恒为 null（右键菜单因此不出现「在新标签打开」），
 * 点节点改为把文件交给宿主展示详情（`onSelect`）。
 */
export function createCodeGraphDomain(options: {
  onSelect: (node: CodeGraphNode) => void;
}): GraphDomain<CodeGraphNode> {
  /** 把一个节点写成一条能精确指向它的查询串（路径即代码的身份） */
  const queryFor = (node: CodeGraphNode): string => {
    if (node.kind === 'tag') return `tag:${node.tag}`;
    if (node.kind === 'ghost') return node.specifier;
    return node.path;
  };

  return {
    queryDoc: codeQueryDoc,
    label: (node) => node.label,
    href: () => null,
    copyText: (node) => ('path' in node ? node.path : node.label),
    order: codeAnimateOrder,
    activate: (node, ops) => {
      // 文件与附件交给宿主展示详情；标签与幽灵节点没有「详情」可看，改为写进筛选框
      // （与内容图谱同一分工：有实体的看实体，纯分类 / 悬空指称的做筛选）
      if (node.kind === 'tag' || node.kind === 'ghost') {
        ops.setSearch(queryFor(node));
        return;
      }
      options.onSelect(node);
    },
    filterFrom: (node, ops) => ops.setSearch(queryFor(node)),
    queryHelp: CODE_GRAPH_QUERY_HELP,
  };
}
