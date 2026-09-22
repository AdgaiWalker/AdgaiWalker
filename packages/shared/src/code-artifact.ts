/**
 * 代码图谱产物的**契约层** —— 三份落盘产物的唯一形状定义与唯一校验点。
 *
 * 为什么要有这一层：`codegraph.json` / `codegraph-health.json` / `architecture-baseline.json`
 * 是 gen 期写、请求期读的跨进程接口，消费者有三个（api / agent / 门禁）。
 * 各消费者手写校验时（此前 agent 只查 2/8 个字段、api 基本不查），漏掉的字段
 * 会在下游某个 `.length` 处变成 TypeError / 500 —— 而且「产物过期」这个最常见
 * 的原因被伪装成了随机崩溃。收拢到这里后：类型改了守卫不可能忘改（同文件），
 * 旧产物得到的是一句「请重跑 code:gen」而不是异常。
 *
 * 解析器**不抛错**：返回 `{ ok, value } | { ok, reason }`，让调用方按自己的
 * 语境决定失败形态（api 转 503、agent 回结构化 error、门禁直接退出）。
 */
import { codeDependencyEdges, type CodeGraph, type CodeGraphHealth } from './code-graph.js';
import type { AcceptedCodeDebt } from './code-debt.js';
import {
  checkSchemaVersion,
  collect,
  isNumber,
  isRecord,
  isStringArray,
  isStringMatrix,
} from './guards.js';
import type { ParseResult } from './parse-result.js';

/** 产物 schema 版本。形状再有破坏性变更时 +1，旧产物会被解析器明确拒绝 */
export const CODE_GRAPH_SCHEMA_VERSION = 1;

/** 解析结果：不抛错，坏产物给原因（通用形态见 `parse-result`） */
export type ArtifactParse<T> = ParseResult<T>;

/** 图产物（`codegraph.json`，公开面）的落盘形状 */
export type CodeGraphArtifact = CodeGraph & { schemaVersion: number };

/** 体检计数 —— 字段名即语义，杜绝「同一批边在两个面叫两个名字」 */
export type CodeGraphCounts = {
  /** 代码文件节点（kind = note） */
  files: number;
  attachments: number;
  tags: number;
  ghosts: number;
  edges: {
    /** 全部边（含文件类型标签边与附件边） */
    total: number;
    /** 真实依赖边（import / 动态导入）——与 `codeDependencyEdges` 同口径 */
    dependency: number;
  };
};

/**
 * 体检产物（`codegraph-health.json`，内部面）的落盘形状 —— **唯一定义在此**。
 * 它是体检结果（CodeGraphHealth）加上落盘所需的元数据；schemaVersion 由契约层统一赋予。
 */
export type CodeGraphHealthArtifact = CodeGraphHealth & {
  schemaVersion: number;
  /** 产出它的那次抽取所基于的 commit */
  sourceCommit: string;
  generatedAt: string;
  /** 唯一口径计数（`codeGraphCounts`）：字段名即语义，依赖边与全部边分开 */
  counts: CodeGraphCounts;
};

/** 门禁基线（`scripts/architecture-baseline.json`）的落盘形状 */
export type ArchitectureBaseline = {
  schemaVersion: number;
  generatedAt: string;
  sourceCommit: string;
  accepted: AcceptedCodeDebt;
};

/**
 * 产物计数，唯一口径。extractor 写产物与 admin 展示都从这里取数 ——
 * 「依赖边 1101」与「全部边 1552」从此在结构上是两个不同的数字，而不是同一字段的两种读法。
 */
export function codeGraphCounts(graph: CodeGraph): CodeGraphCounts {
  const byKind = { files: 0, attachments: 0, tags: 0, ghosts: 0 };
  for (const node of graph.nodes) {
    if (node.kind === 'note') byKind.files += 1;
    else if (node.kind === 'attachment') byKind.attachments += 1;
    else if (node.kind === 'tag') byKind.tags += 1;
    else byKind.ghosts += 1;
  }
  return {
    ...byKind,
    edges: {
      total: graph.edges.length,
      dependency: codeDependencyEdges(graph).length,
    },
  };
}

// ---------------------------------------------------------------- 解析器

const NODE_KINDS = new Set(['note', 'ghost', 'tag', 'attachment']);
const EDGE_KINDS = new Set(['link', 'embed', 'tag', 'attachment']);

/** 产物过期的出路：重新生成 */
const checkVersion = (raw: Record<string, unknown>): string | null =>
  checkSchemaVersion(raw, CODE_GRAPH_SCHEMA_VERSION, '请重跑 pnpm code:gen');

const isGraphNode = (value: unknown): boolean =>
  isRecord(value) && typeof value.id === 'string' && NODE_KINDS.has(String(value.kind));

const isGraphEdge = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.source === 'string' &&
  typeof value.target === 'string' &&
  EDGE_KINDS.has(String(value.kind));

const isFromTo = (value: unknown): boolean =>
  isRecord(value) && typeof value.from === 'string' && typeof value.to === 'string';

const isCounts = (value: unknown): boolean =>
  isRecord(value) &&
  isNumber(value.files) &&
  isNumber(value.attachments) &&
  isNumber(value.tags) &&
  isNumber(value.ghosts) &&
  isRecord(value.edges) &&
  isNumber(value.edges.total) &&
  isNumber(value.edges.dependency);

export function parseCodeGraphArtifact(raw: unknown): ArtifactParse<CodeGraphArtifact> {
  if (!isRecord(raw)) return { ok: false, reason: 'codegraph.json 不是 JSON 对象' };
  const version = checkVersion(raw);
  if (version) return { ok: false, reason: version };
  const problems = collect(
    [!Array.isArray(raw.nodes), 'nodes 必须是数组'],
    [Array.isArray(raw.nodes) && !raw.nodes.every(isGraphNode), 'nodes 存在缺 id/kind 的节点'],
    [!Array.isArray(raw.edges), 'edges 必须是数组'],
    [
      Array.isArray(raw.edges) && !raw.edges.every(isGraphEdge),
      'edges 存在缺 source/target/kind 的边',
    ],
    [typeof raw.generatedAt !== 'string', 'generatedAt 必须是字符串'],
    [!isNumber(raw.seed), 'seed 必须是数字'],
  );
  if (problems.length > 0) {
    return { ok: false, reason: `codegraph.json 形状不对：${problems.join('；')}` };
  }
  return { ok: true, value: raw as unknown as CodeGraphArtifact };
}

export function parseCodeGraphHealthArtifact(
  raw: unknown,
): ArtifactParse<CodeGraphHealthArtifact> {
  if (!isRecord(raw)) return { ok: false, reason: 'codegraph-health.json 不是 JSON 对象' };
  const version = checkVersion(raw);
  if (version) return { ok: false, reason: version };
  // 校验清单 = healthSummary / admin / codeDebtItems 真正解引用的字段的并集。
  // 少查一个字段，就是一次「上游放行、下游 TypeError」。
  const problems = collect(
    [!isStringArray(raw.entries), 'entries 必须是字符串数组'],
    [!isStringMatrix(raw.cycles), 'cycles 必须是字符串数组的数组'],
    [
      !Array.isArray(raw.unresolved) ||
        !raw.unresolved.every(
          (item) => isRecord(item) && typeof item.specifier === 'string' && isStringArray(item.importers),
        ),
      'unresolved 条目缺 specifier/importers',
    ],
    [!isStringArray(raw.unreachable), 'unreachable 必须是字符串数组'],
    [
      !Array.isArray(raw.reverseDependencies) || !raw.reverseDependencies.every(isFromTo),
      'reverseDependencies 条目缺 from/to',
    ],
    [
      !Array.isArray(raw.hubs) ||
        !raw.hubs.every((item) => isRecord(item) && typeof item.path === 'string' && isNumber(item.linkDegree)),
      'hubs 条目缺 path/linkDegree',
    ],
    [
      !Array.isArray(raw.largeFiles) ||
        !raw.largeFiles.every((item) => isRecord(item) && typeof item.path === 'string' && isNumber(item.lines)),
      'largeFiles 条目缺 path/lines',
    ],
    [
      !Array.isArray(raw.nominated) ||
        !raw.nominated.every((item) => isRecord(item) && typeof item.path === 'string' && isStringArray(item.nominatedBy)),
      'nominated 条目缺 path/nominatedBy',
    ],
    [typeof raw.sourceCommit !== 'string', 'sourceCommit 必须是字符串'],
    [typeof raw.generatedAt !== 'string', 'generatedAt 必须是字符串'],
    [!isCounts(raw.counts), 'counts 形状不对（需 files/attachments/tags/ghosts 与 edges.total/edges.dependency）'],
  );
  if (problems.length > 0) {
    return { ok: false, reason: `codegraph-health.json 形状不对：${problems.join('；')}` };
  }
  return { ok: true, value: raw as unknown as CodeGraphHealthArtifact };
}

export function parseArchitectureBaseline(raw: unknown): ArtifactParse<ArchitectureBaseline> {
  if (!isRecord(raw)) return { ok: false, reason: 'architecture-baseline.json 不是 JSON 对象' };
  const version = checkVersion(raw);
  if (version) return { ok: false, reason: version };
  const accepted = raw.accepted;
  const problems = collect(
    [!isRecord(accepted), 'accepted 必须是对象'],
    [!isRecord(accepted) || !isStringMatrix(accepted.cycles), 'accepted.cycles 必须是字符串数组的数组'],
    [!isRecord(accepted) || !isStringArray(accepted.unresolved), 'accepted.unresolved 必须是字符串数组'],
    [!isRecord(accepted) || !isStringArray(accepted.unreachable), 'accepted.unreachable 必须是字符串数组'],
    [
      !isRecord(accepted) ||
        !Array.isArray(accepted.reverseDependencies) ||
        !accepted.reverseDependencies.every(isFromTo),
      'accepted.reverseDependencies 条目缺 from/to',
    ],
    [typeof raw.generatedAt !== 'string', 'generatedAt 必须是字符串'],
    [typeof raw.sourceCommit !== 'string', 'sourceCommit 必须是字符串'],
  );
  if (problems.length > 0) {
    return { ok: false, reason: `architecture-baseline.json 形状不对：${problems.join('；')}` };
  }
  return { ok: true, value: raw as unknown as ArchitectureBaseline };
}
