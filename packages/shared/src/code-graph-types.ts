/**
 * 代码架构图谱数据类型与体检阈值常量（仅类型导入 `./code-resolve.js`）。
 */
import type { ResolutionOutcome } from './code-resolve.js';

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
