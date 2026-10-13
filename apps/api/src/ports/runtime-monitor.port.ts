import type {
  RuntimeLogChannel,
  RuntimeLogEntry,
  RuntimeLogPage,
  RuntimeMetrics,
  RuntimeRequestEntry,
  RuntimeRequestOutcome,
  RuntimeRequestPage,
} from '@walker/shared';

/**
 * 本地开发运行监控的进程内缓冲（端口只有两个：日志与请求）。
 *
 * 为什么定 port 而不是在 controller 里直接 new 一个数组：
 * 采集侧（Nest Logger 的 tee、请求中间件）与查询侧（/ops/runtime/*）必须是**同一个实例**，
 * 否则界面读到的永远是空缓冲。按仓库约定：先定 port，再写 adapter，最后在 kernel 接线。
 *
 * fail 语义（贯穿本端口）：写侧 **fail-open**——实现必须吞掉一切异常，观测失败不得
 * 影响业务请求。这与后台日志（AdminRequestLog，fail-closed，写不进去就 503 拒绝执行）
 * 完全相反，改动前先读这句话。
 */
export const RUNTIME_LOG_BUFFER = Symbol('RUNTIME_LOG_BUFFER');
export const RUNTIME_REQUEST_BUFFER = Symbol('RUNTIME_REQUEST_BUFFER');

export interface RuntimeLogBufferPort {
  /** 采集侧的**唯一**写入口（写入前的脱敏/截断/分级在 shared 的 prepareRuntimeLogEntry 里做）。 */
  append(entry: RuntimeLogEntry): void;
  /** 已因容量上限被覆盖的日志行数：界面要如实显示，不假装没丢。 */
  dropped(): number;
  /**
   * 查询：filter 先于 limit（先筛后用），entries 按时间顺序（旧 → 新）。
   * counts 统计**整段缓冲**（不是筛选后的子集），与面板的"任务 x · 对话 y · 系统 z"一致。
   */
  page(input: { limit: number; channel?: RuntimeLogChannel; errorsOnly: boolean }): RuntimeLogPage;
}

export interface RuntimeRequestRecordInput {
  ts: Date;
  method: string;
  /** 路由模板（不是原始 URL；query 永不进这里） */
  route: string;
  status: number;
  durationMs: number;
  requestId?: string | null;
  /** 缺省按状态码推断；连接被主动掐断时由调用方显式传 interrupted */
  outcome?: RuntimeRequestOutcome;
  /** 后台自动请求（自动轮询 / 发布预检）；判据由调用方按 auth/admin-background-request 给出 */
  background?: boolean;
}

export interface RuntimeRequestBufferPort {
  /** 请求进入：进行中计数 +1 */
  begin(): void;
  /** 请求结束：登记明细并推进计数（finish/close 可能都触发，重复调用只记一次由调用方守卫） */
  finish(input: RuntimeRequestRecordInput): void;
  /**
   * 指标快照。droppedLogLines 由调用方传入——日志缓冲不归这里管，
   * 硬把它注进来会把两个缓冲绑成一个。
   */
  snapshot(now: Date, droppedLogLines: number): RuntimeMetrics;
  /**
   * 明细查询：filter 先于 limit，按时间顺序（旧 → 新）。
   * humanOnly 在**服务端**过滤掉自动轮询——前端不做本地回退（面板踩过的坑）。
   */
  page(input: { limit: number; errorsOnly: boolean; humanOnly: boolean }): RuntimeRequestPage;
}
