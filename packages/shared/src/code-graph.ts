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
import {
  GRAPH_DEFAULT_SEED,
  attachmentNodeId,
  ghostNodeId,
  noteNodeId,
  tagNodeId,
} from './graph-types.js';
import type {
  CodeEdgeKind,
  CodeFileNode,
  CodeGraph,
  CodeGraphEdge,
  CodeGraphInput,
  CodeGraphNode,
  CodeSourceFile,
} from './code-graph-types.js';

export * from './code-graph-types.js';
export * from './code-graph-health.js';

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
