/**
 * 内容图谱领域。
 */
import {
  type GraphNode,
} from '@walker/shared';
import {
  GRAPH_QUERY_HELP,
  animateOrder,
  graphQueryDoc,
  nodeLabel,
  type GraphActivateOps,
  type GraphDomain,
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

