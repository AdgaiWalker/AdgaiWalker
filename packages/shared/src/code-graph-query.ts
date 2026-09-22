/**
 * 代码图谱的查询 —— 纯函数，无 IO。
 *
 * 与内容图谱的 `graphNeighbors` 是同一类东西（邻域查询），但**方向语义相反**：
 * 内容图谱刻意走无向邻接（Obsidian 的局部图同时呈现内链与反向链接），
 * 代码图谱必须**有向** —— 「我依赖谁」与「谁依赖我」是两个不同的问题，
 * 混成一张无向图就答不了「改这个会动到哪」。
 *
 * 口径与体检一致：依赖边取 `codeDependencyEdges`（只含 import / 动态导入，
 * 不含标签与附件 —— 那是分类，不是依赖）。
 */
import {
  codeDependencyEdges,
  type CodeAttachmentNode,
  type CodeEdgeKind,
  type CodeFileNode,
  type CodeGraph,
  type CodeGraphNode,
} from './code-graph.js';

/** `out` = 它依赖谁；`in` = 谁依赖它 */
export type CodeDirection = 'out' | 'in';

export type CodeFileMatch =
  | { found: true; path: string; node: CodeGraphNode }
  | { found: false; reason: 'not-found' | 'ambiguous'; candidates: string[] };

type FileNode = CodeFileNode | CodeAttachmentNode;

function fileNodes(graph: CodeGraph): FileNode[] {
  return graph.nodes.filter(
    (node): node is FileNode => node.kind === 'note' || node.kind === 'attachment',
  );
}

/**
 * 把用户（或 agent）给的指称落到一个文件节点上。
 *
 * 接受三种写法，因为这三种在人和 agent 嘴里都会出现：
 * 1. 完整仓库相对路径：`apps/api/src/kernel.module.ts`
 * 2. 唯一后缀：`kernel.module.ts`、`graph/engine.ts`
 * 3. 节点 id：`note:apps/api/src/kernel.module.ts`
 *
 * 后缀命中多个时**不猜**，把候选交回去让人挑 —— 猜错会让 agent 回答另一个文件的问题。
 */
export function matchCodeFile(graph: CodeGraph, query: string): CodeFileMatch {
  const raw = query.trim();
  if (!raw) return { found: false, reason: 'not-found', candidates: [] };

  const files = fileNodes(graph);

  // 3) 节点 id
  if (raw.startsWith('note:') || raw.startsWith('attachment:')) {
    const byId = files.find((node) => node.id === raw);
    return byId
      ? { found: true, path: byId.path, node: byId }
      : { found: false, reason: 'not-found', candidates: [] };
  }

  const normalized = raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  const exact = files.find((node) => node.path === normalized);
  if (exact) return { found: true, path: exact.path, node: exact };

  const suffix = files.filter((node) => node.path.endsWith(`/${normalized}`));
  if (suffix.length === 1) return { found: true, path: suffix[0]!.path, node: suffix[0]! };
  if (suffix.length > 1) {
    return {
      found: false,
      reason: 'ambiguous',
      candidates: suffix.map((node) => node.path).sort(),
    };
  }
  return { found: false, reason: 'not-found', candidates: [] };
}

export type CodeEdgeRef = { from: string; to: string; kind: CodeEdgeKind };

export type CodeNeighborhood = {
  center: string;
  direction: CodeDirection;
  depth: number;
  /** 邻域内的文件路径（不含中心），按路径排序 */
  paths: string[];
  /** 逐层走出来用到的边（含边的类型：link = 静态导入，embed = 动态导入） */
  edges: CodeEdgeRef[];
};

/**
 * 以某个文件为起点、按给定方向展开 depth 层。
 *
 * 返回**用到的边**而不是「邻域内所有边」：查询要回答的是「怎么连过去的」，
 * 把邻域内其余横向连线也塞进来只会淹掉答案（那属于界面上的局部图要的事）。
 */
export function codeNeighbors(
  graph: CodeGraph,
  centerId: string,
  options: { direction?: CodeDirection; depth?: number } = {},
): CodeNeighborhood {
  const direction = options.direction ?? 'out';
  const depth = Math.max(1, Math.min(10, Math.floor(options.depth ?? 1)));
  const pathById = new Map<string, string>();
  for (const node of fileNodes(graph)) pathById.set(node.id, node.path);

  const center = pathById.get(centerId);
  if (!center) return { center: centerId, direction, depth, paths: [], edges: [] };

  // 邻接表一次建好（并带边类型）：逐层展开时不再回查边表
  const adjacency = new Map<string, Array<{ id: string; kind: CodeEdgeKind }>>();
  for (const edge of codeDependencyEdges(graph)) {
    const from = direction === 'out' ? edge.source : edge.target;
    const to = direction === 'out' ? edge.target : edge.source;
    (adjacency.get(from) ?? adjacency.set(from, []).get(from)!).push({
      id: to,
      kind: edge.kind,
    });
  }
  for (const list of adjacency.values()) list.sort((a, b) => (a.id < b.id ? -1 : 1));

  const visited = new Set<string>([centerId]);
  const edges: CodeEdgeRef[] = [];
  const seenEdges = new Set<string>();
  let frontier = [centerId];
  for (let level = 0; level < depth; level += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of adjacency.get(id) ?? []) {
        const from = direction === 'out' ? id : neighbour.id;
        const to = direction === 'out' ? neighbour.id : id;
        const key = `${from}\u0000${to}\u0000${neighbour.kind}`;
        if (!seenEdges.has(key)) {
          seenEdges.add(key);
          edges.push({
            from: pathById.get(from)!,
            to: pathById.get(to)!,
            kind: neighbour.kind,
          });
        }
        if (visited.has(neighbour.id)) continue;
        visited.add(neighbour.id);
        next.push(neighbour.id);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  const paths = [...visited]
    .filter((id) => id !== centerId)
    .map((id) => pathById.get(id)!)
    .sort();
  return { center, direction, depth, paths, edges };
}

export type CodeImpact = {
  center: string;
  /** 实际展开的层数上限 */
  depth: number;
  /** 直接依赖它的文件 */
  direct: string[];
  /** 间接依赖它的文件（不含 direct） */
  transitive: string[];
  /** 受影响的文件按工作区单元归堆（含 direct 与 transitive）—— 一眼看出会波及哪几个应用 */
  byApp: Array<{ app: string; count: number }>;
};

/**
 * 改动影响面：反方向传递闭包（谁（间接）依赖这个文件）。
 * 这是代码图谱里唯一不可替代的查询 —— 内容图谱答不了它，正则也答不了它。
 */
export function codeImpact(
  graph: CodeGraph,
  centerId: string,
  maxDepth = 5,
): CodeImpact {
  const depth = Math.max(1, Math.min(10, Math.floor(maxDepth)));
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const center = byId.get(centerId);
  const empty: CodeImpact = {
    center: center?.kind === 'note' || center?.kind === 'attachment' ? center.path : '',
    depth,
    direct: [],
    transitive: [],
    byApp: [],
  };
  if (!center || (center.kind !== 'note' && center.kind !== 'attachment')) return empty;

  const reverse = new Map<string, string[]>();
  for (const edge of codeDependencyEdges(graph)) {
    (reverse.get(edge.target) ?? reverse.set(edge.target, []).get(edge.target)!).push(
      edge.source,
    );
  }
  for (const list of reverse.values()) list.sort();

  const directIds = new Set(reverse.get(centerId) ?? []);
  const seen = new Set<string>([centerId, ...directIds]);
  let frontier = [...directIds];
  for (let level = 1; level < depth; level += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const dependent of reverse.get(id) ?? []) {
        if (seen.has(dependent)) continue;
        seen.add(dependent);
        next.push(dependent);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  const pathOf = (id: string): string => {
    const node = byId.get(id);
    return node && (node.kind === 'note' || node.kind === 'attachment') ? node.path : id;
  };
  const direct = [...directIds].map(pathOf).sort();
  const transitive = [...seen]
    .filter((id) => id !== centerId && !directIds.has(id))
    .map(pathOf)
    .sort();

  const appCounts = new Map<string, number>();
  for (const path of [...direct, ...transitive]) {
    const parts = path.split('/');
    const app =
      parts[0] === 'apps' || parts[0] === 'packages'
        ? `${parts[0]}/${parts[1]}`
        : (parts[0] ?? '');
    appCounts.set(app, (appCounts.get(app) ?? 0) + 1);
  }

  return {
    center: pathOf(centerId),
    depth,
    direct,
    transitive,
    byApp: [...appCounts.entries()]
      .map(([app, count]) => ({ app, count }))
      .sort((a, b) => b.count - a.count || (a.app < b.app ? -1 : 1)),
  };
}
