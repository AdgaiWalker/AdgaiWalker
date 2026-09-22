/**
 * code-graph 插件 — 读代码图谱产物（与 /architecture 页面同一份），供 MCP 工具查询。
 *
 * 与 knowledge 的分工：
 * - knowledge 是**内容**（文章互引），要吃 `aiUsePolicy` 那套机器可读权限；
 * - 这边是**代码自身的结构事实**（谁 import 谁），产物由脚本从编译器语法树抽出，
 *   不含任何人工推断，也没有内容权限语义 —— 它描述的是「这个仓库怎么搭起来的」。
 *
 * 两个产物的分工照 PRD：`codegraph.json` 是公开面（节点与边），
 * `codegraph-health.json` 是内部面（体检明细）。agent 是内部消费方，两者都读；
 * 但体检缺失时**只降级健康查询**，不牵连依赖查询（两者价值不对等）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { Context, Service } from '@deepseek-ai/cordis';
import {
  codeImpact,
  codeNeighbors,
  matchCodeFile,
  parseCodeGraphArtifact,
  parseCodeGraphHealthArtifact,
  type CodeFileNode,
  type CodeGraph,
  type CodeGraphHealthArtifact,
  type CodeGraphNode,
  type CodeImpact as CodeImpactResult,
  type CodeNeighborhood,
} from '@walker/shared';

export interface CodeGraphConfig {
  /** codegraph.json 路径（相对 cwd 或绝对） */
  codeGraphPath: string;
  /** codegraph-health.json 路径；缺失时只影响 health() */
  healthPath: string;
}

/** 查询失败时回的结构：**不抛错**，把「为什么没查到」交回给调用方 */
export type CodeQueryFailure = {
  error: 'not-found' | 'ambiguous' | 'health-unavailable';
  query: string;
  hint: string;
  candidates?: string[];
};

export type CodeFileSummary = {
  path: string;
  app: string;
  extension: string;
  lines: number;
  /** 有多少文件依赖它 */
  inDegree: number;
  /** 它依赖了多少文件 */
  outDegree: number;
};

/**
 * 传递影响面的列出上限。
 * 代码图是**稠密**的（与内容图相反）：改 `packages/shared/src/graph.ts` 这类枢纽会波及
 * 200+ 个文件，全量塞给 agent 只会淹掉答案。故截断，但**如实回传总数**（`transitiveTotal`），
 * 绝不静默丢信息。直接依赖者不截断 —— 那才是要动手改的部分，且通常不多。
 */
export const IMPACT_LIST_LIMIT = 60;

export type CodeDependenciesAnswer = {
  file: CodeFileSummary;
  direction: 'out';
  depth: number;
  /** 它依赖的文件（深度 1 为直接依赖） */
  files: string[];
  edges: Array<{ from: string; to: string; kind: string }>;
};

export type CodeDependentsAnswer = {
  file: CodeFileSummary;
  direction: 'in';
  depth: number;
  /** 依赖它的文件（深度 1 为直接依赖者） */
  files: string[];
  edges: Array<{ from: string; to: string; kind: string }>;
};

export type CodeImpactAnswer = CodeImpactResult & {
  /** 截断**前**的传递影响面总数（列表被截断时仍如实回传） */
  transitiveTotal: number;
  /** `transitive` 是否被截断（true 时只有前 `IMPACT_LIST_LIMIT` 条） */
  truncated: boolean;
};

export type CodeHealthAnswer = {
  sourceCommit: string;
  generatedAt: string;
  counts: CodeGraphHealthArtifact['counts'];
  /** 四项硬伤（进基线，新增即失败） */
  hard: {
    cycles: number;
    unresolved: number;
    unreachable: number;
    reverseDependencies: number;
  };
  /** 风格项（只告警）：计数 + 前几条明细，够 agent 转述 */
  style: {
    largeFiles: number;
    hubs: number;
    topHubs: Array<{ path: string; linkDegree: number }>;
    /** 被路径字符串提名、但提名者自己不可达的文件数（降级证据，提名不作为可达依据） */
    nominated: number;
  };
  entries: number;
};

/** 只有文件/附件有文件字段；用守卫而不是 `as`，让契约留在类型里（tag/ghost 没有这些字段） */
function isFileNode(node: CodeGraphNode): node is CodeFileNode {
  return node.kind === 'note' || node.kind === 'attachment';
}

function summarize(node: CodeGraphNode): CodeFileSummary {
  if (!isFileNode(node)) {
    throw new Error(`code-graph: ${node.kind} 节点没有文件字段（指称解析应当只回文件）`);
  }
  return {
    path: node.path,
    app: node.app,
    extension: node.extension,
    lines: node.lines,
    inDegree: node.inDegree,
    outDegree: node.outDegree,
  };
}

export class CodeGraphService extends Service {
  static readonly provide = 'codeGraph';

  private readonly graph: CodeGraph;
  private readonly health: CodeGraphHealthArtifact | null;

  constructor(ctx: Context, config: CodeGraphConfig) {
    super(ctx, 'codeGraph');

    // 图产物是本插件的**硬依赖**：形状/版本不对就带着原因启动失败，
    // 绝不带一个「看起来像」的图继续答题（契约层 shared/code-artifact 是唯一校验点）
    const graphFile = path.resolve(config.codeGraphPath);
    const parsed = parseCodeGraphArtifact(JSON.parse(fs.readFileSync(graphFile, 'utf8')));
    if (!parsed.ok) {
      throw new Error(`code-graph: ${graphFile} 不可用 —— ${parsed.reason}`);
    }
    this.graph = parsed.value;

    // 体检产物缺失只降级 health()：依赖查询不依赖它
    this.health = readHealth(path.resolve(config.healthPath));
  }

  /** 把指称落到一个文件上；查不到/歧义时回原因而不是抛错 */
  private locate(query: string): { node: CodeGraphNode } | CodeQueryFailure {
    const match = matchCodeFile(this.graph, query);
    if (match.found) return { node: match.node };
    if (match.reason === 'ambiguous') {
      return {
        error: 'ambiguous',
        query,
        hint: '这个后缀命中多个文件，请改用完整仓库相对路径',
        candidates: match.candidates,
      };
    }
    return {
      error: 'not-found',
      query,
      hint: '仓库里没有这个文件。产物取自 Git 里的源码，新增文件需先跑 pnpm code:gen',
    };
  }

  /** 它依赖谁（沿 import 方向展开） */
  dependencies(query: string, depth = 1): CodeDependenciesAnswer | CodeQueryFailure {
    const located = this.locate(query);
    if ('error' in located) return located;
    const hood = codeNeighbors(this.graph, located.node.id, { direction: 'out', depth });
    return {
      file: summarize(located.node),
      direction: 'out',
      depth: hood.depth,
      files: hood.paths,
      edges: hood.edges.map((edge) => ({ from: edge.from, to: edge.to, kind: edge.kind })),
    };
  }

  /** 谁依赖它（沿反向 import 展开）—— 与 dependencies 是不同的问题，别混用 */
  dependents(query: string, depth = 1): CodeDependentsAnswer | CodeQueryFailure {
    const located = this.locate(query);
    if ('error' in located) return located;
    const hood: CodeNeighborhood = codeNeighbors(this.graph, located.node.id, {
      direction: 'in',
      depth,
    });
    return {
      file: summarize(located.node),
      direction: 'in',
      depth: hood.depth,
      files: hood.paths,
      edges: hood.edges.map((edge) => ({ from: edge.from, to: edge.to, kind: edge.kind })),
    };
  }

  /** 改动影响面：谁（间接）依赖这个文件，并按工作区单元归堆 */
  impact(query: string, depth = 5): CodeImpactAnswer | CodeQueryFailure {
    const located = this.locate(query);
    if ('error' in located) return located;
    const result = codeImpact(this.graph, located.node.id, depth);
    return {
      ...result,
      center: result.center || summarize(located.node).path,
      transitiveTotal: result.transitive.length,
      truncated: result.transitive.length > IMPACT_LIST_LIMIT,
      transitive: result.transitive.slice(0, IMPACT_LIST_LIMIT),
    };
  }

  /** 结构体检摘要（读的是内部面产物） */
  healthSummary(): CodeHealthAnswer | CodeQueryFailure {
    if (!this.health) {
      return {
        error: 'health-unavailable',
        query: '',
        hint: 'codegraph-health.json 未找到；先跑 pnpm code:gen 生成产物',
      };
    }
    const { health } = this;
    return {
      sourceCommit: health.sourceCommit,
      generatedAt: health.generatedAt,
      counts: health.counts,
      hard: {
        cycles: health.cycles.length,
        unresolved: health.unresolved.length,
        unreachable: health.unreachable.length,
        reverseDependencies: health.reverseDependencies.length,
      },
      style: {
        largeFiles: health.largeFiles.length,
        hubs: health.hubs.length,
        topHubs: health.hubs.slice(0, 5),
        nominated: health.nominated.length,
      },
      entries: health.entries.length,
    };
  }
}

/**
 * 体检产物读不出来时返回 null（让 health() 自己说明，而不是让整个 agent 起不来）。
 *
 * 校验**只经 shared 契约层**，且覆盖 `healthSummary()` 真正解引用的每一个字段的
 * `.length`：少查一个，一份「上一版抽出的」产物就会通过检查，然后在工具里抛
 * TypeError —— 那时就不再是结构化 error，而是调用失败。
 */
function readHealth(file: string): CodeGraphHealthArtifact | null {
  try {
    const parsed = parseCodeGraphHealthArtifact(JSON.parse(fs.readFileSync(file, 'utf8')));
    return parsed.ok ? parsed.value : null;
  } catch {
    return null;
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    codeGraph: CodeGraphService;
  }
}
