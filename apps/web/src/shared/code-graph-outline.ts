/**
 * 代码图谱的 HTML 兜底结构 —— 纯函数。
 *
 * canvas 画出来的图形对爬虫完全不可见，而 GEO 门禁要求 indexable 路由有真实静态正文。
 * 因此用**同一份** `codegraph.json` 生成语义化清单（GEO 兜底 + 无 JS 可读）。
 *
 * 公开面边界（PRD-CODE-GRAPH §公开面边界）：这里只出「相对路径 + 依赖边」，
 * **不出文件内容，也不出体检违规明细**（环/死文件那类只在门禁与 admin 内部面）。
 * 解析不到的引用可以出：它本来就在公开图里（就是那些幽灵节点）。
 */
import { codeDependencyEdges, type CodeFileNode, type CodeGraph } from '@walker/shared';

export type CodeOutlineEntry = {
  path: string;
  label: string;
  app: string;
  extension: string;
  lines: number;
  /** 它 import 的文件（已解析成功的，按路径排序） */
  imports: string[];
  /** import 它的文件（按路径排序） */
  importedBy: string[];
};

export type CodeOutline = {
  entries: CodeOutlineEntry[];
  /** 按工作区单元分组（apps/web · apps/api · packages/shared · scripts …） */
  groups: Array<{ app: string; paths: string[] }>;
  /** 解析不到的引用：说明符 → 引入它的文件 */
  unresolved: Array<{ specifier: string; importers: string[] }>;
  attachments: string[];
  extensions: Array<{ extension: string; count: number }>;
  /** 真实依赖边总数（不含文件类型标签边） */
  linkCount: number;
  /** 被依赖最多的文件 —— 文字版也要能看出枢纽在哪 */
  hubs: Array<{ path: string; inDegree: number }>;
  counts: { files: number; attachments: number; ghosts: number; tags: number };
};

/** 枢纽在文字版里列几个（图形上是「圆最大」的那些） */
const HUB_LIMIT = 10;

export function buildCodeGraphOutline(graph: CodeGraph): CodeOutline {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const files = graph.nodes.filter(
    (node): node is CodeFileNode => node.kind === 'note',
  );

  const importsByPath = new Map<string, Set<string>>();
  const importedByPath = new Map<string, Set<string>>();
  let linkCount = 0;

  // 依赖边的口径**必须**走 shared 的 codeDependencyEdges：自己再写一遍
  // 「kind 是 link/embed 且两端都是代码文件」就是第二份规则，迟早与体检/查询漂移。
  for (const edge of codeDependencyEdges(graph)) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (source?.kind !== 'note' || target?.kind !== 'note') continue;
    linkCount += 1;
    (importsByPath.get(source.path) ?? importsByPath.set(source.path, new Set()).get(source.path)!)
      .add(target.path);
    (
      importedByPath.get(target.path) ??
      importedByPath.set(target.path, new Set()).get(target.path)!
    ).add(source.path);
  }

  const sorted = (set: Set<string> | undefined): string[] => (set ? [...set].sort() : []);

  const entries: CodeOutlineEntry[] = files
    .map((node) => ({
      path: node.path,
      label: node.label,
      app: node.app,
      extension: node.extension,
      lines: node.lines,
      imports: sorted(importsByPath.get(node.path)),
      importedBy: sorted(importedByPath.get(node.path)),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const groupMap = new Map<string, string[]>();
  const extensionCounts = new Map<string, number>();
  for (const entry of entries) {
    (groupMap.get(entry.app) ?? groupMap.set(entry.app, []).get(entry.app)!).push(entry.path);
  }
  // 文件类型统计覆盖**全部**文件（含 css / json 附件），与图上的类型标签节点同口径 ——
  // 只数代码文件会让页面说「2 种类型」而图上明明挂着 4 个标签。
  for (const node of graph.nodes) {
    const extension = 'extension' in node ? node.extension : '';
    if (!extension) continue;
    extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1);
  }

  const importersByGhost = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    const target = byId.get(edge.target);
    if (target?.kind !== 'ghost') continue;
    const source = byId.get(edge.source);
    if (source?.kind !== 'note') continue;
    (
      importersByGhost.get(target.specifier) ??
      importersByGhost.set(target.specifier, new Set()).get(target.specifier)!
    ).add(source.path);
  }

  return {
    entries,
    groups: [...groupMap.entries()]
      .map(([app, paths]) => ({ app, paths }))
      .sort((a, b) => b.paths.length - a.paths.length || (a.app < b.app ? -1 : 1)),
    unresolved: [...importersByGhost.entries()]
      .map(([specifier, importers]) => ({
        specifier,
        importers: [...importers].sort(),
      }))
      .sort((a, b) => (a.specifier < b.specifier ? -1 : 1)),
    attachments: graph.nodes
      .filter((node) => node.kind === 'attachment')
      .map((node) => ('path' in node ? node.path : ''))
      .filter(Boolean)
      .sort(),
    extensions: [...extensionCounts.entries()]
      .map(([extension, count]) => ({ extension, count }))
      .sort((a, b) => b.count - a.count || (a.extension < b.extension ? -1 : 1)),
    linkCount,
    hubs: entries
      .filter((entry) => entry.importedBy.length > 0)
      .map((entry) => ({ path: entry.path, inDegree: entry.importedBy.length }))
      .sort((a, b) => b.inDegree - a.inDegree || (a.path < b.path ? -1 : 1))
      .slice(0, HUB_LIMIT),
    counts: {
      files: entries.length,
      attachments: graph.nodes.filter((node) => node.kind === 'attachment').length,
      ghosts: graph.nodes.filter((node) => node.kind === 'ghost').length,
      tags: graph.nodes.filter((node) => node.kind === 'tag').length,
    },
  };
}
