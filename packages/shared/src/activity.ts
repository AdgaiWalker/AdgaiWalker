/**
 * 运营活动流：契约与归并/筛选纯函数（2026-10-12，唯一来源）。
 *
 * 五个旧 tab（运行记录/访客对话/更新提醒/更新复盘/运行监控）按**数据库表**分类，
 * 站主要按**"我要干什么"**看 —— 这里把它们投影成同一条时间线。
 *
 * 四条纪律（违反任何一条，时间线就会开始撒谎）：
 *
 * ① **事实时间，不漂移**。排序键是各源记录的 createdAt（提醒用 dueAt，见下），
 *    不用"最近活动"一类会随回看而漂移的口径，否则同一条会话在流里位置会变。
 *    访客会话用 lastActivityAt 是**折中**：它本身是个事实（最近一轮发生时间），
 *    且一条会话折叠为一行（不展开每轮），不存在同一条上下跳动的问题。
 *
 * ② **读取时投影，不落第二真相源**。Event 是 run/conversation/reminder/review/adminLog
 *    的只读投影，每条带 provenance（来源类型 + 来源 id），永不落库。删了源，流里就没有。
 *
 * ③ **分页如实降级**。跨源归并只保证"每源各自最近 N 条"内有序；翻页用时间游标
 *    （before = 上页最后一条的 ts，各源查 createdAt < before 再归并）。当某一源的
 *    事件比别的源密（比如访客对话很多），深处历史会稀疏不均 —— 这是归并的诚实代价，
 *    界面明说"翻更早建议按类型筛"，不假装能均匀翻到底。
 *
 * ④ **提醒是待办，不是流水**。到期未处理的事项没有"发生时间"语义，用 dueAt 排序并
 *    置顶（TODO_FIRST）。已完成/忽略的提醒按处置事实进入流，算普通事件。
 */

export const ACTIVITY_KINDS = ['visitor', 'reminder', 'review', 'run', 'admin'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  visitor: '访客',
  reminder: '提醒',
  review: '复盘',
  run: '运行',
  admin: '后台操作',
};

export function isActivityKind(value: unknown): value is ActivityKind {
  return typeof value === 'string' && (ACTIVITY_KINDS as readonly string[]).includes(value);
}

/**
 * 严重度是"这条要不要打扰你"，不是日志等级：
 * - todo：等你动手的（到期提醒）
 * - error：出了坏结果（失败运行、失败/未投递的回答）
 * - warn：值得看一眼（降级回答）
 * - info：其余
 */
export const ACTIVITY_SEVERITIES = ['info', 'warn', 'error', 'todo'] as const;
export type ActivitySeverity = (typeof ACTIVITY_SEVERITIES)[number];

export const ACTIVITY_SEVERITY_LABELS: Record<ActivitySeverity, string> = {
  info: '正常',
  warn: '降级',
  error: '异常',
  todo: '待办',
};

/** 事件在时间线上的排序时间。提醒待办用它排到最前面（见 compareActivity）。 */
export const ACTIVITY_TODO_TS = '9999-12-31T23:59:59.999Z';

export interface ActivityEvent {
  /** 稳定行键：kind + 来源 id（同源同 id 只出现一次） */
  key: string;
  /** 事实时间（ISO）；待办提醒为 ACTIVITY_TODO_TS 占位 */
  ts: string;
  kind: ActivityKind;
  severity: ActivitySeverity;
  /** 一行摘要：站主扫一眼就知道发生了什么，不点开也能读 */
  title: string;
  /** 副信息（谁、状态、数量一类），可空 */
  detail: string | null;
  /** 来源回指：前端据此展开详情或跳既有详情页，永不伪造 */
  provenance: {
    kind: ActivityKind;
    /** 各源的主键：conversationId / actionId / review id / run id / adminLog id */
    id: string;
    /** 展开详情用的既有路由参数（如 agentId），没有为 null */
    ref: string | null;
  };
  /** 是否为待办（置顶、计数） */
  isTodo: boolean;
}

export interface ActivityPage {
  events: ActivityEvent[];
  /** 每源参与归并前取多少条。分页精度受它约束（纪律③）。 */
  sourceLimit: number;
  /** 下一页游标：最后一条的 ts；没有更早为 null */
  next: string | null;
}

export interface ActivityCounts {
  /** 待办：到期未处理的提醒（overdue + today + undated 未忽略） */
  remindersPending: number;
  /** 最近的失败运行数（窗口内，窗口由 API 声明） */
  runsFailed: number;
  /** 最近的降级回答数（窗口内） */
  answersDegraded: number;
  /** 工作区领先最近一次已确证发布的条目数（没有发布事实时为 null，不是 0） */
  releaseWorkingAhead: number | null;
}

// ── 归并与排序 ────────────────────────────────────────────────────────

/**
 * 排序：待办置顶；其余按时间倒序。同刻并列时用 key 定序，保证分页稳定
 * （两次请求同样的数据必须得到同样的顺序，否则翻页会漏/重）。
 */
export function compareActivity(a: ActivityEvent, b: ActivityEvent): number {
  if (a.isTodo !== b.isTodo) return a.isTodo ? -1 : 1;
  if (a.ts !== b.ts) return a.ts < b.ts ? 1 : -1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** 归并各源投影：去重（按 key）、排序、截断。纯函数，前后端共用。 */
export function mergeActivity(
  sources: readonly (readonly ActivityEvent[])[],
  limit: number,
): ActivityEvent[] {
  const byKey = new Map<string, ActivityEvent>();
  for (const source of sources) {
    for (const event of source) byKey.set(event.key, event);
  }
  return [...byKey.values()].sort(compareActivity).slice(0, limit);
}

// ── 筛选 ──────────────────────────────────────────────────────────────

export function filterActivity(
  events: readonly ActivityEvent[],
  kinds: readonly ActivityKind[],
): ActivityEvent[] {
  if (kinds.length === 0) return [...events];
  const allow = new Set<ActivityKind>(kinds);
  return events.filter((event) => allow.has(event.kind));
}

/** 分页游标：取严格早于 before 的事件（before 为空取最新）。 */
export function beforeCursor(events: readonly ActivityEvent[], before?: string | null): ActivityEvent[] {
  if (!before) return [...events];
  return events.filter((event) => event.ts < before);
}

// ── 查询参数解析（非法就拒，不静默兜默认值） ──────────────────────────

export const ACTIVITY_PAGE_LIMIT_MAX = 50;

export function parseActivityLimit(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return ACTIVITY_PAGE_LIMIT_MAX;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > ACTIVITY_PAGE_LIMIT_MAX) return null;
  return value;
}

/** kind 列表：逗号分隔；空 = 全部；出现未知值整体拒绝（不猜）。 */
export function parseActivityKinds(raw: unknown): ActivityKind[] | null {
  if (raw === undefined || raw === null || raw === '') return [];
  if (typeof raw !== 'string') return null;
  const parts = raw.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length === 0) return [];
  const kinds: ActivityKind[] = [];
  for (const part of parts) {
    if (!isActivityKind(part)) return null;
    if (!kinds.includes(part)) kinds.push(part);
  }
  return kinds;
}

export function parseActivityBefore(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') return null;
  return Number.isFinite(Date.parse(raw)) ? raw : null;
}

// ── 摘要格式（服务端拼，前后端一致） ──────────────────────────────────

/** 访客事件标题：最新一问截断到单行可读，不把整段塞进摘要。 */
export function visitorTitle(question: string | null, turnCount: number): string {
  const oneLine = (question ?? '').replace(/\s+/gu, ' ').trim();
  const clipped = oneLine.length > 40 ? oneLine.slice(0, 40) + '…' : oneLine;
  return clipped.length > 0 ? clipped : '(未记录提问)';
}

/** 运行事件标题：状态 + 耗时，事实直读，不解读。 */
export function runTitle(state: string, elapsedMs: number | null, agentName: string | null): string {
  const who = agentName ?? 'Agent';
  const elapsed = elapsedMs === null ? '' : ' ' + formatElapsed(elapsedMs);
  return who + ' · ' + state + elapsed;
}

export function formatElapsed(ms: number): string {
  if (ms < 1_000) return ms + ' ms';
  if (ms < 60_000) return (ms / 1_000).toFixed(1) + ' s';
  return Math.round(ms / 60_000) + ' min';
}
