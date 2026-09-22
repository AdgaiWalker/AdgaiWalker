/**
 * 代码架构图谱模型 —— 纯函数，无 IO。
 *
 * 语义照抄 Obsidian Graph View：圆圈 = 文件（节点），线 = 文件之间的真实引用（边），
 * 被依赖越多节点越大。**只呈现代码自身的结构事实，不做任何人工推断**：
 * 这里的每一条边都来自一条真实存在的 import 语句。
 *
 * 与内容图谱（`graph.ts`）的关系：
 * - **不复用**模型：那里的输入是内容条目（slug/title/series…），这里是源文件路径与导入。
 * - **复用**节点 id 方案（`note:` / `ghost:` / `tag:` / `attachment:`）与四个 kind 名，
 *   好让 web 侧图谱引擎（配色、线型、设置面板、检索语法）零改动复用。
 *
 * 权威：docs/PRD-CODE-GRAPH.md
 */
import type { ResolutionOutcome } from './code-resolve.js';
import type { CodeGraphCounts } from './code-artifact.js';
import {
  GRAPH_DEFAULT_SEED,
  attachmentNodeId,
  ghostNodeId,
  noteNodeId,
  tagNodeId,
} from './graph.js';

/** 沿用内容图谱的 kind 名：此处 `note` = 代码文件，`ghost` = 解析不到的 import */
export type CodeNodeKind = 'note' | 'ghost' | 'tag' | 'attachment';
/** `link` = 静态 import / export-from；`embed` = 动态 `import()` */
export type CodeEdgeKind = 'link' | 'embed' | 'tag' | 'attachment';

export type CodeImport = {
  /** 原始说明符，如 `./errors.js` / `@walker/shared` / `react` */
  specifier: string;
  /** 静态 import / export-from = static；动态 `import()` = dynamic */
  form: 'static' | 'dynamic';
  /** 由 `resolveCodeSpecifier` 判定 */
  outcome: ResolutionOutcome;
  /** 解析到的目标相对路径；external / unresolved 为 null */
  target: string | null;
};

export type CodeSourceFile = {
  /** 相对仓库根的路径（POSIX 分隔） */
  path: string;
  /** git 首次提交时间，作为生长动画依据 */
  created?: string;
  /** 文件行数；缺省 0（未扫描到的文件，如仓库根之外的解析目标） */
  lines?: number;
  imports?: readonly CodeImport[];
};

type CodeNodeBase = {
  id: string;
  kind: CodeNodeKind;
  /** 展示用标签：文件名 / 扩展名 / 原始说明符 */
  label: string;
  /** 全类型边度数（含 tag） */
  totalDegree: number;
  /** 仅真实依赖边（import / 动态导入 / 附件引用）——「死文件」体检的依据，与 totalDegree 语义不同 */
  linkDegree: number;
  inDegree: number;
  outDegree: number;
};

export type CodeFileNode = CodeNodeBase & {
  kind: 'note';
  path: string;
  /** 所属工作区单元：apps/web · apps/api · packages/shared · scripts … */
  app: string;
  /** 形如 `.ts` / `.tsx` / `.css`；无扩展名时为空串 */
  extension: string;
  created: string;
  /** 行数。「超大文件」是风格项（只告警），依据就是它 */
  lines: number;
};

export type CodeAttachmentNode = CodeNodeBase & {
  kind: 'attachment';
  path: string;
  app: string;
  extension: string;
  created: string;
  lines: number;
};

export type CodeTagNode = CodeNodeBase & {
  kind: 'tag';
  /** 文件类型标签值，形如 `.ts`（含点，便于直接展示） */
  tag: string;
};

export type CodeGhostNode = CodeNodeBase & {
  kind: 'ghost';
  /** 解析不到的原始说明符 */
  specifier: string;
};

export type CodeGraphNode =
  | CodeFileNode
  | CodeAttachmentNode
  | CodeTagNode
  | CodeGhostNode;

export type CodeGraphEdge = {
  source: string;
  target: string;
  kind: CodeEdgeKind;
};

export type CodeGraph = {
  generatedAt: string;
  /** 布局随机种子：同输入必须产出同布局 */
  seed: number;
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
};

export type CodeGraphInput = {
  files: readonly CodeSourceFile[];
  now?: string;
  seed?: number;
};

const CODE_EXTENSIONS = /\.(ts|tsx|mts|cts)$/i;

function basenameOf(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] ?? path;
}

function extensionOf(path: string): string {
  const base = basenameOf(path);
  const cut = base.lastIndexOf('.');
  // cut <= 0 覆盖「无扩展名」与「以点开头的隐藏文件」
  return cut <= 0 ? '' : base.slice(cut).toLowerCase();
}

function appOf(path: string): string {
  const parts = path.split('/');
  if ((parts[0] === 'apps' || parts[0] === 'packages') && parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] ?? '';
}

const zeroDegrees = () => ({ totalDegree: 0, linkDegree: 0, inDegree: 0, outDegree: 0 });

/**
 * 由「源文件 + 已解析的导入」构建代码图谱。
 *
 * 不变式：节点 id 全局唯一 / 无自环 / 同 (source,target,kind) 去重 /
 * 每条边的两端都必然存在节点（代码是被编译器强制的，不留悬空边）。
 */
export function buildCodeGraph(input: CodeGraphInput): CodeGraph {
  // 路径去重：id 唯一是硬不变式，重复路径只保留首个
  const files: CodeSourceFile[] = [];
  const seenPath = new Set<string>();
  for (const file of input.files) {
    const path = file.path?.trim();
    if (!path || seenPath.has(path)) continue;
    seenPath.add(path);
    files.push({ ...file, path });
  }

  // 标签消歧：同名文件用相对路径（照 Obsidian 的处理）
  const basenameCount = new Map<string, number>();
  for (const file of files) {
    const base = basenameOf(file.path);
    basenameCount.set(base, (basenameCount.get(base) ?? 0) + 1);
  }
  const createdByPath = new Map<string, string>();
  const linesByPath = new Map<string, number>();
  for (const file of files) {
    createdByPath.set(file.path, file.created ?? '');
    linesByPath.set(file.path, Math.max(0, Math.floor(file.lines ?? 0)));
  }

  /**
   * 展示标签：代码文件去掉扩展名（`App.tsx` → `App`），附件保留扩展名
   * （照 Obsidian：笔记显示 `note`、附件显示 `image.png`）。重名时用相对路径。
   */
  const labelFor = (path: string): string => {
    const base = basenameOf(path);
    const collide = (basenameCount.get(base) ?? 0) > 1;
    const isCode = CODE_EXTENSIONS.test(path);
    if (collide) return isCode ? path.replace(/\.[^./]*$/, '') : path;
    return isCode ? base.replace(/\.[^./]*$/, '') : base;
  };

  const nodesById = new Map<string, CodeGraphNode>();
  const fileNodeId = new Map<string, string>();
  const edges: CodeGraphEdge[] = [];
  const seenEdges = new Set<string>();

  const put = (node: CodeGraphNode): void => {
    if (!nodesById.has(node.id)) nodesById.set(node.id, node);
  };

  const pushEdge = (source: string, target: string, kind: CodeEdgeKind): void => {
    if (source === target) return; // 无自环
    const key = `${source}\u0000${target}\u0000${kind}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push({ source, target, kind });
  };

  const ensureFileNode = (path: string): string => {
    const existing = fileNodeId.get(path);
    if (existing) return existing;
    const common = {
      ...zeroDegrees(),
      path,
      label: labelFor(path),
      app: appOf(path),
      extension: extensionOf(path),
      created: createdByPath.get(path) ?? '',
      lines: linesByPath.get(path) ?? 0,
    };
    const node: CodeGraphNode = CODE_EXTENSIONS.test(path)
      ? { ...common, id: noteNodeId(path), kind: 'note' }
      : { ...common, id: attachmentNodeId(path), kind: 'attachment' };
    put(node);
    fileNodeId.set(path, node.id);
    return node.id;
  };

  const ensureTagNode = (tag: string): string => {
    const id = tagNodeId(tag);
    put({ id, kind: 'tag', label: tag, tag, ...zeroDegrees() });
    return id;
  };

  const ensureGhostNode = (specifier: string): string => {
    const id = ghostNodeId(specifier);
    put({ id, kind: 'ghost', label: specifier, specifier, ...zeroDegrees() });
    return id;
  };

  // Pass 1：文件节点（代码文件 = note，非代码文件 = attachment）
  for (const file of files) ensureFileNode(file.path);

  // Pass 2：依赖边。外部包跳过（外链不算边）；解析不到 → 幽灵；代码 → link/embed；非代码 → attachment
  for (const file of files) {
    const source = fileNodeId.get(file.path)!;
    for (const spec of file.imports ?? []) {
      if (spec.outcome === 'external') continue;
      if (spec.outcome === 'unresolved') {
        pushEdge(source, ensureGhostNode(spec.specifier), spec.form === 'dynamic' ? 'embed' : 'link');
        continue;
      }
      if (!spec.target) continue; // 防御：有解析结论却没有目标
      const targetId = ensureFileNode(spec.target);
      pushEdge(
        source,
        targetId,
        spec.outcome === 'attachment'
          ? 'attachment'
          : spec.form === 'dynamic'
            ? 'embed'
            : 'link',
      );
    }
  }

  // Pass 3：文件类型标签边
  for (const file of files) {
    const extension = extensionOf(file.path);
    if (!extension) continue;
    pushEdge(fileNodeId.get(file.path)!, ensureTagNode(extension), 'tag');
  }

  // Pass 4：度数
  for (const edge of edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (source) {
      source.outDegree += 1;
      source.totalDegree += 1;
    }
    if (target) {
      target.inDegree += 1;
      target.totalDegree += 1;
    }
    if (edge.kind !== 'tag') {
      if (source) source.linkDegree += 1;
      if (target) target.linkDegree += 1;
    }
  }

  // 输出顺序：文件节点按路径、其余按 id —— 同输入必须同输出
  const all = [...nodesById.values()];
  const notes = all
    .filter((node): node is CodeFileNode => node.kind === 'note')
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const rest = all
    .filter((node) => node.kind !== 'note')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    generatedAt: input.now ?? new Date().toISOString(),
    seed: input.seed ?? GRAPH_DEFAULT_SEED,
    nodes: [...notes, ...rest],
    edges,
  };
}

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

/** 结构体检结果。四项硬伤进基线，「新增即失败」；枢纽与超大文件是风格项，只告警。 */
export type CodeGraphHealth = {
  /** 实际存在的入口文件（可达性的根） */
  entries: string[];
  /** 环依赖：每条是一个强连通分量的成员路径（已排序）；只有成员数 > 1 才算环 */
  cycles: string[][];
  /** 解析不到的 import：说明符 → 引入它的文件 */
  unresolved: Array<{ specifier: string; importers: string[] }>;
  /** 从真实入口不可达的代码文件（死文件） */
  unreachable: string[];
  /** 包反向依赖应用（依赖方向越界） */
  reverseDependencies: Array<{ from: string; to: string }>;
  /** 超级枢纽：真实依赖度数最高的文件（风格项） */
  hubs: Array<{ path: string; linkDegree: number }>;
  /** 超大文件：行数达到阈值者（风格项） */
  largeFiles: Array<{ path: string; lines: number }>;
  /**
   * 被路径字符串提名、但提名者自己不可达的文件 —— **记账，不判定**。
   * 可达性只信客观入口与「可达文件的提名」；这一栏是降级证据，报告如实列出，
   * 让人能审「启发式有没有在掩盖真死文件」，而不是静默丢掉这条信息。
   */
  nominated: Array<{ path: string; nominatedBy: string[] }>;
};

/** 超大文件阈值（行）。本仓实测：≥300 有 25 个、≥400 有 13 个、≥500 有 6 个 —— 取 500 才是信号不是噪声 */
export const LARGE_FILE_LINES = 500;

export type CodeHealthOptions = {
  /** 真实入口（来自 package.json / vite 配置的事实，不是人工规则） */
  entries: readonly string[];
  /** 枢纽告警条数，默认 10 */
  hubLimit?: number;
  /** 超大文件阈值（行），默认 `LARGE_FILE_LINES` */
  largeFileLines?: number;
  /**
   * 字符串提名证据：文件路径 → 提名它的文件（仅收集，**不参与**可达性判定）。
   * 可达性只信客观入口与「可达文件的提名」；这里传入的证据只用来产出 `nominated`。
   */
  nominations?: ReadonlyMap<string, readonly string[]>;
};

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
  const reverseAdjacency = new Map<string, string[]>();
  for (const edge of dependencyEdges) {
    const from = noteById.get(edge.source)!.path;
    const to = noteById.get(edge.target)!.path;
    (adjacency.get(from) ?? adjacency.set(from, []).get(from)!).push(to);
    (reverseAdjacency.get(to) ?? reverseAdjacency.set(to, []).get(to)!).push(from);
  }

  const sortedPaths = notes.map((node) => node.path).sort();
  for (const list of adjacency.values()) list.sort();
  for (const list of reverseAdjacency.values()) list.sort();

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
