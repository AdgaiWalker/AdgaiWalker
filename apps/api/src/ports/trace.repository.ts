/**
 * 轨迹仓储端口（TECH-DESIGN §6.1）
 * 读：按 seq 游标增量读 / 尾部 N 行（禁止全量解析）。
 * 写：append-only，唯一写入器（发布运行与 Agent 运行共用同一份事实）。
 */
import type { NormalizedTraceEvent, TraceEventType, TraceSource } from '@walker/shared';

/** 读取参数：after 为游标（只回 seq > after 的事件），limit 为单次上限 */
export interface TraceReadOptions {
  after?: number;
  /** 单次最多返回条数（默认尾部 500 行） */
  limit?: number;
}

/** 读取结果：事件 + 诚实截断标记 */
export interface TraceReadResult {
  events: NormalizedTraceEvent[];
  /**
   * true = 反向扫描窗未能覆盖游标边界 after+1（命中扫描上限），
   * 本次增量可能不完整。前台据此如实提示，绝不静默漏事件。
   */
  truncated: boolean;
}

export interface TraceRepositoryPort {
  /**
   * 读取某次运行的事件（升序）。默认返回尾部 N 行；给了 after 则只回增量。
   * 运行不存在（无 trace 文件）时返回 null，由调用方决定 404 语义。
   * after 模式下窗口必须覆盖 after+1；不可覆盖时以 truncated 标记（诚实语义）。
   */
  readEvents(
    runId: string,
    options?: TraceReadOptions,
  ): Promise<TraceReadResult | null>;
  /** 删除指定逻辑运行的文件轨迹；runId 由服务端来源校验。 */
  deleteTraceFile(runId: string): Promise<void>;
}

export const TRACE_REPOSITORY = Symbol('TRACE_REPOSITORY');

/** 追加事件输入：信封的 v/ts/role 由写入器补齐，seq 由写入器按运行分配 */
export interface TraceAppendInput {
  type: TraceEventType;
  payload: unknown;
  /** 默认 'api'（发布运行写 'publish'） */
  source?: TraceSource;
  ts?: number;
}

export interface TraceWriterPort {
  /** 追加一条事件，返回分配的 seq（单调递增，从 1 开始） */
  append(runId: string, event: TraceAppendInput): Promise<number>;
}

export const TRACE_WRITER = Symbol('TRACE_WRITER');
