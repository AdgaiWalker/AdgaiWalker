/**
 * 代码图谱依赖边抽取与结构体检（Tarjan SCC / 可达性 / 反向依赖等）—— 仅依赖 `./code-graph-types.js`。
 */
import {
  LARGE_FILE_LINES,
  type CodeFileNode,
  type CodeGraph,
  type CodeGraphEdge,
  type CodeGraphHealth,
  type CodeHealthOptions,
} from './code-graph-types.js';

/**
 * 真实依赖边：文件 → 文件的 import / 动态导入。
 * 附件与标签边**不参与**环、可达性与影响面判定 —— 它们是分类，不是依赖。
 * 抽成一处，是因为体检与查询必须同口径（否则「可达」与「谁依赖我」会互相矛盾）。
 */
export function codeDependencyEdges(graph: CodeGraph): CodeGraphEdge[] {
  const ids = new Set(
    graph.nodes
      .filter((node): node is CodeFileNode => node.kind === 'note')
      .map((node) => node.id),
  );
  return graph.edges.filter(
    (edge) =>
      (edge.kind === 'link' || edge.kind === 'embed') &&
      ids.has(edge.source) &&
      ids.has(edge.target),
  );
}

/**
 * 求强连通分量（Tarjan）。只有成员数 > 1 才是环——单节点分量是正常文件。
 * 顶点按传入顺序遍历，输出再排序，保证同图同结果。
 */
function stronglyConnectedComponents(
  vertices: readonly string[],
  adjacency: ReadonlyMap<string, readonly string[]>,
): string[][] {
  let counter = 0;
  const indices = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];

  const visit = (vertex: string): void => {
    indices.set(vertex, counter);
    lowLink.set(vertex, counter);
    counter += 1;
    stack.push(vertex);
    onStack.add(vertex);

    for (const next of adjacency.get(vertex) ?? []) {
      if (!indices.has(next)) {
        visit(next);
        lowLink.set(vertex, Math.min(lowLink.get(vertex)!, lowLink.get(next)!));
      } else if (onStack.has(next)) {
        lowLink.set(vertex, Math.min(lowLink.get(vertex)!, indices.get(next)!));
      }
    }

    if (lowLink.get(vertex) === indices.get(vertex)) {
      const component: string[] = [];
      for (;;) {
        const popped = stack.pop()!;
        onStack.delete(popped);
        component.push(popped);
        if (popped === vertex) break;
      }
      components.push(component);
    }
  };

  for (const vertex of vertices) if (!indices.has(vertex)) visit(vertex);
  return components;
}

/**
 * 结构体检：只报**机器能独立证明**的问题，不读任何人工规则表。
 *
 * 为什么不含「越层」：`controller 不得导入 adapter` 是意图，写在
 * `docs/ARCHITECTURE.md` 的声明里；再抄一份规则文件就成了第二个真相源。
 * 这四项的证据全在代码与清单自身，不需要额外声明。
 */
export function inspectCodeGraph(
  graph: CodeGraph,
  options: CodeHealthOptions,
): CodeGraphHealth {
  const notes = graph.nodes.filter((node): node is CodeFileNode => node.kind === 'note');
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const noteById = new Map(notes.map((node) => [node.id, node]));
  const notePathSet = new Set(notes.map((node) => node.path));

  // 依赖边：只看文件 → 文件的 import（附件与标签不参与环与可达性）
  const dependencyEdges = codeDependencyEdges(graph);

  const adjacency = new Map<string, string[]>();
  for (const edge of dependencyEdges) {
    const from = noteById.get(edge.source)!.path;
    const to = noteById.get(edge.target)!.path;
    (adjacency.get(from) ?? adjacency.set(from, []).get(from)!).push(to);
  }

  const sortedPaths = notes.map((node) => node.path).sort();
  for (const list of adjacency.values()) list.sort();

  // 1) 环依赖
  const cycles = stronglyConnectedComponents(sortedPaths, adjacency)
    .filter((component) => component.length > 1)
    .map((component) => [...component].sort())
    .sort((a, b) => (a.join('\u0000') < b.join('\u0000') ? -1 : 1));

  // 2) 解析不到的 import
  const importersByGhost = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    const target = nodeById.get(edge.target);
    if (target?.kind !== 'ghost') continue;
    const importer = noteById.get(edge.source);
    if (!importer) continue;
    if (!importersByGhost.has(target.specifier)) importersByGhost.set(target.specifier, new Set());
    importersByGhost.get(target.specifier)!.add(importer.path);
  }
  const unresolved = [...importersByGhost.entries()]
    .map(([specifier, importers]) => ({ specifier, importers: [...importers].sort() }))
    .sort((a, b) => (a.specifier < b.specifier ? -1 : 1));

  // 3) 从真实入口不可达的死文件（前向可达，动态导入同样算可达）
  const entries = [...new Set(options.entries)]
    .filter((entry) => notePathSet.has(entry))
    .sort();
  const reachable = new Set<string>(entries);
  const queue = [...entries];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const next of adjacency.get(current) ?? []) {
      if (reachable.has(next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }
  const unreachable = sortedPaths.filter((path) => !reachable.has(path));

  // 4) packages 反向依赖 apps
  const seenReverse = new Set<string>();
  const reverseDependencies: Array<{ from: string; to: string }> = [];
  for (const edge of dependencyEdges) {
    const from = noteById.get(edge.source)!.path;
    const to = noteById.get(edge.target)!.path;
    if (!from.startsWith('packages/') || !to.startsWith('apps/')) continue;
    const key = `${from}\u0000${to}`;
    if (seenReverse.has(key)) continue;
    seenReverse.add(key);
    reverseDependencies.push({ from, to });
  }
  reverseDependencies.sort((a, b) =>
    a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : 1,
  );

  // 5) 风格项：超级枢纽
  const hubLimit = Math.max(0, options.hubLimit ?? 10);
  const hubs = notes
    .filter((node) => node.linkDegree > 0)
    .sort((a, b) => (b.linkDegree - a.linkDegree) || (a.path < b.path ? -1 : 1))
    .slice(0, hubLimit)
    .map((node) => ({ path: node.path, linkDegree: node.linkDegree }));

  // 6) 风格项：超大文件（行数未统计的文件为 0，不会误报）
  const largeFileLines = Math.max(1, options.largeFileLines ?? LARGE_FILE_LINES);
  const largeFiles = notes
    .filter((node) => node.lines >= largeFileLines)
    .sort((a, b) => (b.lines - a.lines) || (a.path < b.path ? -1 : 1))
    .map((node) => ({ path: node.path, lines: node.lines }));

  // 7) 降级证据：被提名但提名者自己不可达。只记账，不据此改判可达性
  const nominated = [...(options.nominations ?? [])]
    .filter(([path]) => !reachable.has(path))
    .map(([path, by]) => ({ path, nominatedBy: [...by].sort() }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    entries,
    cycles,
    unresolved,
    unreachable,
    reverseDependencies,
    hubs,
    largeFiles,
    nominated,
  };
}
