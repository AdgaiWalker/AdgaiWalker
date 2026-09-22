/**
 * 代码结构体检数据源端口。
 *
 * 读的是三份**只读文件**：公开图（codegraph.json）、内部体检（codegraph-health.json）、
 * 门禁基线（architecture-baseline.json）。本端口不做任何计算 ——
 * 对账口径在 shared 的 `diffCodeDebt`，与门禁共用同一份实现。
 *
 * 边界：这是站主工具面（同 GraphController），走管理凭据防线，不进公网白名单。
 * 权威：docs/PRD-CODE-GRAPH.md
 */
import type {
  ArchitectureBaseline as SharedArchitectureBaseline,
  CodeGraph,
  CodeGraphHealthArtifact,
} from '@walker/shared';

/**
 * 门禁基线的落盘形状。
 * 唯一定义在 shared 的契约层（门禁写、这里读，形状只有一份真相）—— 这里
 * re-export 只为保持既有 `import type { ArchitectureBaseline } from '../ports/…'` 不变。
 */
export type ArchitectureBaseline = SharedArchitectureBaseline;

export type CodeHealthBundle = {
  graph: CodeGraph;
  health: CodeGraphHealthArtifact;
  /** 基线可能不存在（还没跑过 --update-baseline）；此时 admin 只展示现状 */
  baseline: ArchitectureBaseline | null;
};

export interface CodeHealthPort {
  /**
   * 产物读不出来时应抛 `CodeHealthError`（按「谁的错」分类），不要返回空结构冒充健康，
   * 也不要抛裸 ENOENT / TypeError 让下游去猜。
   */
  load(): Promise<CodeHealthBundle>;
}

/** load() 失败的错误分类 */
export type CodeHealthErrorCode =
  /** 产物没生成（还没跑过 pnpm code:gen）—— 流程的错 */
  | 'code-health-unavailable'
  /** 环境变量显式指了路径但文件不存在 —— 运维配置的错 */
  | 'code-health-misconfigured'
  /** 产物存在但形状/版本不对（过期或损坏）—— 需要重新生成 */
  | 'code-health-malformed';

export class CodeHealthError extends Error {
  constructor(
    readonly code: CodeHealthErrorCode,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'CodeHealthError';
  }
}

export const CODE_HEALTH = Symbol('CODE_HEALTH');
