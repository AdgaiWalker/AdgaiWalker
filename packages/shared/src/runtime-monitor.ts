/**
 * 本地开发运行监控：契约与规则唯一来源（2026-10-12）
 *
 * 形态抄自本机面板 WorkBuddy2API 控制台 #logs 页的两块（「请求指标」+「运行日志」），
 * 字段按我们自己的事实重定：我们没有 token 计费与上游账号池，不硬凑假的成本列。
 *
 * 这份文件回答三个问题，且只有这一处回答：
 * 1. 一条日志属于哪个频道（任务 / 对话 / 系统）—— channelForContext
 * 2. 一条日志算不算「报错」—— levelForText / isRuntimeErrorEntry / combineRuntimeLogLevel
 * 3. 没有分母时怎么显示 —— 复用 ops-stats 的 rateOrNull + 本文件的 formatRuntimeRatio
 *
 * 三条纪律（面板踩过的坑，写在这里免得再踩）：
 *
 * ① 筛选为空 ≠ 没有数据源。面板源码注释记着一次事故：筛选结果为空时退回未筛选的内存
 *    记录，管理员按 A 筛选却看到 B 的请求，"据此查错人"。本实现的过滤一律在服务端完成
 *    （HTTP 查询参数），前端不做任何本地回退——从结构上排除这条错路，故这里没有"回退"函数。
 *
 * ② 分母为 0 不出比率。没有任何已结束请求时 successRate / avgDurationMs 是 null，
 *    界面显示「—」，绝不写 0% / 0ms（沿用 O06/O07「缺失不记 0」）。
 *
 * ③ fail-open，与后台日志相反。采集失败、容量溢出只计数不抛出，业务照跑；界面文案是
 *    "日志不可用"，不是"操作未执行"。后台日志（AdminRequestLog）是 fail-closed（写不进去
 *    就 503 拒绝执行），两者语义相反，改这块之前先读这句。
 */

import { rateOrNull } from './ops-stats.js';

export const RUNTIME_LOG_CHANNELS = ['task', 'chat', 'sys'] as const;
export type RuntimeLogChannel = (typeof RUNTIME_LOG_CHANNELS)[number];

/** 频道展示名（前后端共用，界面不许自译一遍）。 */
export const RUNTIME_LOG_CHANNEL_LABELS: Record<RuntimeLogChannel, string> = {
  task: '任务',
  chat: '对话',
  sys: '系统',
};

export function isRuntimeLogChannel(value: unknown): value is RuntimeLogChannel {
  return typeof value === 'string' && (RUNTIME_LOG_CHANNELS as readonly string[]).includes(value);
}

export const RUNTIME_LOG_LEVELS = ['info', 'warn', 'error'] as const;
export type RuntimeLogLevel = (typeof RUNTIME_LOG_LEVELS)[number];

/**
 * 请求结果四档 + 一档中断。
 *
 * 为什么单独有 interrupted（面板同款分档）：前端在切换会话/卸载组件时会 abort 轮询，
 * 那是**我们主动掐掉的**，既不是成功也不是失败。把它算进分母会让"成功率"变成一句谎话
 * （每 5 秒的轮询被 abort 一次，成功率就会看起来很低）。所以它只进明细与独立计数，
 * 不进成功率的分母。
 */
export const RUNTIME_REQUEST_OUTCOMES = [
  'success',
  'redirect',
  'client_error',
  'server_error',
  'interrupted',
] as const;
export type RuntimeRequestOutcome = (typeof RUNTIME_REQUEST_OUTCOMES)[number];

export const RUNTIME_REQUEST_OUTCOME_LABELS: Record<RuntimeRequestOutcome, string> = {
  success: '成功',
  redirect: '跳转',
  client_error: '客户端错误',
  server_error: '服务端错误',
  interrupted: '中断',
};

/** 内存纪律（2C2G 起家的约束不因"只是本地开发"放松）：800 行 × 单行 2KB 上限约 2MB。 */
export const RUNTIME_LOG_BUFFER_LIMIT = 800;
export const RUNTIME_LOG_LINE_MAX_BYTES = 2_048;
export const RUNTIME_LOG_PAGE_LIMIT_MAX = 500;
export const RUNTIME_REQUEST_BUFFER_LIMIT = 200;
export const RUNTIME_REQUEST_PAGE_LIMIT_MAX = 200;

/** 未匹配到路由时的占位：只记形状，不记 URL（query 永不入库、永不上界面）。 */
export const RUNTIME_UNMATCHED_ROUTE = '[unmatched]';

export interface RuntimeLogEntry {
  /** ISO 时间，由采集侧盖章（界面只负责显示） */
  ts: string;
  channel: RuntimeLogChannel;
  level: RuntimeLogLevel;
  /** 单行文本：已脱敏、已把换行压平、已按字节截断 */
  text: string;
  requestId: string | null;
  /** 是否因超长被截断（界面要标出来，避免把半句当全句读） */
  truncated: boolean;
}

export interface RuntimeRequestEntry {
  ts: string;
  method: string;
  /** 路由模板（如 /ops/runtime/logs），**不是**带 query 的原始 URL */
  route: string;
  status: number;
  outcome: RuntimeRequestOutcome;
  durationMs: number;
  requestId: string | null;
  /**
   * 是否为后台自动请求（自动轮询、发布预检）。
   *
   * 判据由服务端给出，实现**只有一份**（apps/api/src/auth/admin-background-request.ts），
   * 后台日志与运行监控共用它。客户端只拿它做两件事：在「全部」视图里把噪音行标成「自动」，
   * 以及支撑「只看人工操作」筛选（筛选本身也在服务端做）。
   */
  background: boolean;
}

export interface RuntimeMetrics {
  /** 进程观测起点 */
  startedAt: string;
  uptimeMs: number;
  /** 已结束的请求数（分母） */
  completed: number;
  /** 其中 4xx / 5xx 的条数 */
  failed: number;
  /** 被主动掐断的请求数：单独计数，不混进 completed/failed（见 outcome 注释） */
  interrupted: number;
  /** 正在处理中的请求数（绝对数，不参与比率） */
  inFlight: number;
  /** 分母为 0 时为 null */
  successRate: number | null;
  /** 没有任何耗时样本时为 null */
  avgDurationMs: number | null;
  /** 因容量上限被丢弃的日志行数（不假装没丢） */
  droppedLogLines: number;
  /** 因容量上限被丢弃的请求记录数 */
  droppedRequests: number;
}

export interface RuntimeLogPage {
  entries: RuntimeLogEntry[];
  counts: Record<RuntimeLogChannel, number>;
  dropped: number;
}

export interface RuntimeRequestPage {
  entries: RuntimeRequestEntry[];
}

/**
 * 频道归类：按 Nest Logger 的 context 归类，命中顺序固定（任务优先）。
 * 这是**启发式**，不是精确分类：未知 context 一律归「系统」，宁可放在大桶里也不猜。
 */
const TASK_CONTEXT_HINTS = [
  'execution',
  'release',
  'publish',
  'reminder',
  'outbox',
  'scheduler',
  'retention',
  'deletion',
  'export',
  'workstation',
  'deployment',
  'reminder-scan',
];

const CHAT_CONTEXT_HINTS = [
  'assistant',
  'harness',
  'model',
  'llm',
  'conversation',
  'intake',
  'nextstep',
];

export function channelForContext(context: string | null | undefined): RuntimeLogChannel {
  const value = (context ?? '').trim().toLowerCase();
  if (!value) return 'sys';
  if (TASK_CONTEXT_HINTS.some((hint) => value.includes(hint))) return 'task';
  if (CHAT_CONTEXT_HINTS.some((hint) => value.includes(hint))) return 'chat';
  return 'sys';
}

/**
 * 关键词判级：只认结构化程度最低的信号（与面板同一套做法），不引入日志解析协议。
 * 顺序是先 error 后 warn —— 一行同时含"失败"和"重试"时按 error 处理。
 */
const ERROR_TEXT_PATTERN = /error|exception|failed|failure|fatal|crash|panic|unhandled|错误|失败|异常|崩溃|拒绝/iu;
const WARN_TEXT_PATTERN = /warn|warning|degrad|deprecated|retry|timeout|警告|降级|冷却|熔断|超时|重试|重连|兜底/iu;

export function levelForText(text: string): RuntimeLogLevel {
  if (ERROR_TEXT_PATTERN.test(text)) return 'error';
  if (WARN_TEXT_PATTERN.test(text)) return 'warn';
  return 'info';
}

/** 调用点等级与文本等级取更高者：logger.warn 里写了"失败"，它在界面上就是报错。 */
export function combineRuntimeLogLevel(
  callSite: RuntimeLogLevel,
  text: string,
): RuntimeLogLevel {
  const fromText = levelForText(text);
  const rank: Record<RuntimeLogLevel, number> = { info: 0, warn: 1, error: 2 };
  return rank[fromText] > rank[callSite] ? fromText : callSite;
}

export function isRuntimeErrorEntry(entry: Pick<RuntimeLogEntry, 'level' | 'text'>): boolean {
  return entry.level === 'error' || levelForText(entry.text) === 'error';
}

export function isRuntimeWarningEntry(entry: Pick<RuntimeLogEntry, 'level' | 'text'>): boolean {
  return !isRuntimeErrorEntry(entry) && (entry.level === 'warn' || levelForText(entry.text) === 'warn');
}

const ELLIPSIS = '…';

/** 单个码点的 UTF-8 字节数：不用 TextEncoder，避免 shared 对运行时环境产生依赖。 */
function utf8SizeOf(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp < 0x80) return 1;
  if (cp < 0x800) return 2;
  if (cp < 0x10000) return 3;
  return 4;
}

export function utf8Length(text: string): number {
  let bytes = 0;
  for (const ch of text) bytes += utf8SizeOf(ch);
  return bytes;
}

/** 超长行按 UTF-8 字节截断，留一个省略号位置；返回值必须告诉调用方"这只是半句"。 */
export function truncateRuntimeLogText(
  text: string,
  maxBytes: number = RUNTIME_LOG_LINE_MAX_BYTES,
): { text: string; truncated: boolean } {
  if (maxBytes <= 0) return { text: '', truncated: text.length > 0 };
  if (utf8Length(text) <= maxBytes) return { text, truncated: false };
  // 省略号 U+2026 自身占 3 个 UTF-8 字节（不是 1）：预留必须按真实字节数算，
  // 否则"截断后仍在字节上限内"这句话不成立（实测会超 2 字节）。
  const reserve = utf8SizeOf(ELLIPSIS);
  let bytes = 0;
  let out = '';
  for (const ch of text) {
    const size = utf8SizeOf(ch);
    if (bytes + size > maxBytes - reserve) break;
    out += ch;
    bytes += size;
  }
  return { text: out + ELLIPSIS, truncated: true };
}

/** 一条日志压成一行：换行会破坏"一行一条"的流式观感，这里统一压平。 */
export function flattenRuntimeLogText(text: string): string {
  return text.replace(/\s*\r?\n\s*/gu, ' ⏎ ').trim();
}

/**
 * 采集侧唯一入口：脱敏 → 压平 → 截断 → 定频道定级 → 盖章。
 * 顺序不能改：先脱敏再截断，避免把凭据截成半截后逃过匹配。
 */
export function prepareRuntimeLogEntry(input: {
  ts: Date;
  context?: string | null;
  level?: RuntimeLogLevel;
  text: string;
  requestId?: string | null;
  redact?: (text: string) => string;
}): RuntimeLogEntry {
  const redact = input.redact ?? ((text: string) => text);
  const safe = truncateRuntimeLogText(flattenRuntimeLogText(redact(String(input.text ?? ''))));
  const callSite = input.level ?? 'info';
  return {
    ts: input.ts.toISOString(),
    channel: channelForContext(input.context),
    level: combineRuntimeLogLevel(callSite, safe.text),
    text: safe.text,
    requestId: input.requestId ?? null,
    truncated: safe.truncated,
  };
}

export function outcomeForStatus(status: number): RuntimeRequestOutcome {
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  if (status >= 300) return 'redirect';
  return 'success';
}

export function isRuntimeRequestError(entry: Pick<RuntimeRequestEntry, 'outcome'>): boolean {
  return entry.outcome === 'client_error' || entry.outcome === 'server_error';
}

/**
 * 人工操作 = 不是后台自动请求。
 * 「只看人工操作」筛选与界面上的「自动」标记共用这一处语义，别在两边各写一遍。
 */
export function isHumanRuntimeRequest(entry: Pick<RuntimeRequestEntry, 'background'>): boolean {
  return !entry.background;
}

/** 被我们主动掐掉的连接：既不算成功也不算失败（见 RUNTIME_REQUEST_OUTCOMES 注释）。 */
export function isRuntimeRequestInterrupted(entry: Pick<RuntimeRequestEntry, 'outcome'>): boolean {
  return entry.outcome === 'interrupted';
}

/** 参与成功率分母的请求（有真实 HTTP 结果的那些）。 */
export function countsTowardSuccessRate(entry: Pick<RuntimeRequestEntry, 'outcome'>): boolean {
  return !isRuntimeRequestInterrupted(entry);
}

/**
 * 路由模板：Express 的 route 模式只含参数名，不含参数值；baseUrl 是 @Controller 前缀。
 * 拿不到模式时写 [unmatched]，**绝不退回原始 URL**（那里带 query）。
 */
export function routeTemplate(baseUrl: string | undefined, routePath: string | undefined): string {
  if (!routePath) return RUNTIME_UNMATCHED_ROUTE;
  const template = (baseUrl ?? '') + routePath;
  return template.length > 0 ? template : RUNTIME_UNMATCHED_ROUTE;
}

/** 指标由采集侧的原始计数算出：这里不做任何"猜"的补全。 */
export function computeRuntimeMetrics(input: {
  startedAt: string;
  now: Date;
  /** 参与比率计算的请求数（**不含**中断，见 countsTowardSuccessRate） */
  completed: number;
  failed: number;
  interrupted: number;
  inFlight: number;
  totalDurationMs: number;
  droppedLogLines: number;
  droppedRequests: number;
}): RuntimeMetrics {
  const startedMs = Date.parse(input.startedAt);
  const uptimeMs = Number.isFinite(startedMs) ? Math.max(0, input.now.getTime() - startedMs) : 0;
  const successRate =
    input.completed > 0
      ? rateOrNull(input.completed - input.failed, input.completed)
      : null;
  const avgDurationMs =
    input.completed > 0 && Number.isFinite(input.totalDurationMs)
      ? Math.round(input.totalDurationMs / input.completed)
      : null;
  return {
    startedAt: input.startedAt,
    uptimeMs,
    completed: input.completed,
    failed: input.failed,
    interrupted: input.interrupted,
    inFlight: input.inFlight,
    successRate,
    avgDurationMs,
    droppedLogLines: input.droppedLogLines,
    droppedRequests: input.droppedRequests,
  };
}

/** 比率显示：null 一律「—」，不写 0%（与后台概览同一约定）。 */
export function formatRuntimeRatio(value: number | null): string {
  if (value === null) return '—';
  // 一位小数但去掉无意义的 .0：75% 不写成 75.0%，83.33% 也不假装自己是 83%（保留一位）。
  return (value * 100).toFixed(1).replace(/\.0$/u, '') + '%';
}

export function formatRuntimeDuration(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('zh-CN') + ' ms';
}

/** 分页上限解析：null 表示参数非法（调用方按 400 拒绝），不是"用默认值兜住"。 */
export function parseRuntimePageLimit(raw: unknown, max: number): number | null {
  if (raw === undefined || raw === null || raw === '') return max;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) return null;
  return value;
}

/** 布尔查询参数只接受明确的真值，其他一律 false（不猜）。 */
export function parseRuntimeFlag(raw: unknown): boolean {
  return raw === true || raw === '1' || raw === 'true' || raw === 'yes';
}
