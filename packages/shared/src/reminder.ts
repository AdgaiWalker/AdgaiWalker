import type { ActionStatus } from './action.js';
import { normalizePlannedDate } from './action.js';

/**
 * 提醒时区与到期时刻（TECH-DESIGN §12.4 / O01）
 *
 * 规则只有一份：仅设置日期的事项按**站点时区当日 00:00** 到期；
 * 瞬时一律存 UTC，同时保留生成它的 IANA 时区，使「日期 → UTC → 日期」可无损还原。
 * 换算全部用 Intl 完成，不引入时区数据库依赖，也不在别处再写一遍偏移算法。
 */

/** 站点默认时区：日期型提醒按该时区当日 00:00 到期 */
export const DEFAULT_SITE_TIMEZONE = 'Asia/Shanghai';

export type ActionDueSource = 'date' | 'instant';

export interface ActionDue {
  /** UTC 瞬时（ISO 8601 带 Z）；未设置日期时为 null */
  dueAt: string | null;
  /**
   * 生成该瞬时所用的 IANA 时区；重放时据此还原站点本地日期。
   * **未排期时为 null**：没有瞬时就没有「生成它的时区」，存默认值会假装已按时区排期。
   */
  timezone: string | null;
  source: ActionDueSource | null;
}

/** 占位：Intl 无法识别的时区名一律拒绝，不做静默回退。 */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** 读某瞬时在该时区的墙上时间，再按 UTC 解释；差值即该瞬时的偏移量。 */
function offsetMsAt(instantMs: number, timeZone: string): number {
  const parts = formatter(timeZone).formatToParts(new Date(instantMs));
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  const wallAsUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  );
  return wallAsUtc - instantMs;
}

/** 把某时区的墙上时间换算为 UTC 瞬时；跨夏令时边界做二次校正。 */
export function zonedWallTimeToUtc(wall: WallParts, timeZone: string): string {
  if (!isValidTimeZone(timeZone)) throw new Error('invalid-timezone');
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const firstGuess = asUtc - offsetMsAt(asUtc, timeZone);
  const refined = asUtc - offsetMsAt(firstGuess, timeZone);
  return new Date(refined).toISOString();
}

/** 把 UTC 瞬时还原为该时区的墙上日期（YYYY-MM-DD）。 */
export function utcToZonedDate(instantIso: string, timeZone: string): string {
  if (!isValidTimeZone(timeZone)) throw new Error('invalid-timezone');
  const parsed = new Date(instantIso);
  if (Number.isNaN(parsed.getTime())) throw new Error('invalid-instant');
  const parts = formatter(timeZone).formatToParts(parsed);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

/**
 * 由「站点本地日期」推导到期瞬时。
 * 空值返回未排期；时区非法直接拒绝，不猜测。
 */
export function resolveActionDue(input: {
  plannedDate?: string | null;
  timezone?: string | null;
}): ActionDue {
  const timezone = input.timezone?.trim() || DEFAULT_SITE_TIMEZONE;
  if (!isValidTimeZone(timezone)) throw new Error('invalid-timezone');
  const plannedDate = normalizePlannedDate(input.plannedDate);
  // 未排期 = 没有到期瞬时，也就没有「生成它的时区」可保留；
  // 存默认时区会让「未排期」看起来像「已按时区排期」，故如实置 null。
  if (plannedDate === null) return { dueAt: null, timezone: null, source: null };
  const [year, month, day] = plannedDate.split('-').map(Number) as [number, number, number];
  return {
    dueAt: zonedWallTimeToUtc({ year, month, day, hour: 0, minute: 0, second: 0 }, timezone),
    timezone,
    source: 'date',
  };
}

/**
 * 发生记录去重键：同一事项、同一到期瞬时只允许一条发生记录。
 * 键刻意不含「扫描批次/时间」，否则重复扫描会绕过唯一约束。
 */
export function reminderOccurrenceKey(input: {
  actionId: string;
  dueAt: string;
  timezone: string;
}): string {
  return `${input.actionId}@${input.dueAt}@${input.timezone}`;
}

/** 复盘观察窗口：两端都是站点本地日期，含首尾。 */
export function normalizeReviewWindow(input: {
  windowStart?: string | null;
  windowEnd?: string | null;
}): { windowStart: string | null; windowEnd: string | null } {
  const windowStart = normalizePlannedDate(input.windowStart ?? null);
  const windowEnd = normalizePlannedDate(input.windowEnd ?? null);
  if (windowStart && windowEnd && windowStart > windowEnd) {
    throw new Error('invalid-review-window');
  }
  return { windowStart, windowEnd };
}

/** 到期处置结果：待处理 / 完成 / 延后 / 忽略（O03 在此之上做状态推进） */
export const REMINDER_OUTCOMES = ['PENDING', 'DONE', 'SNOOZED', 'IGNORED'] as const;
export type ReminderOutcome = (typeof REMINDER_OUTCOMES)[number];

export function isReminderOutcome(value: unknown): value is ReminderOutcome {
  return typeof value === 'string' && (REMINDER_OUTCOMES as readonly string[]).includes(value);
}

/**
 * 复盘证据充分度：样本不足时必须如实写 UNKNOWN，不得把模型建议说成已验证成效。
 */
export const REVIEW_EVIDENCE_STATES = ['SUFFICIENT', 'INSUFFICIENT', 'UNKNOWN'] as const;
export type ReviewEvidenceState = (typeof REVIEW_EVIDENCE_STATES)[number];

export function isReviewEvidenceState(value: unknown): value is ReviewEvidenceState {
  return typeof value === 'string' && (REVIEW_EVIDENCE_STATES as readonly string[]).includes(value);
}

/**
 * 提醒处置动作（O03）：每项只解决一个主要行为。
 * 完成 = 事项结束；延后 = 换一个到期日（旧到期随之失效）；忽略 = 撤下这次到期，但事项仍开放。
 */
export const REMINDER_DISPOSITIONS = ['complete', 'snooze', 'ignore'] as const;
export type ReminderDisposition = (typeof REMINDER_DISPOSITIONS)[number];

export function isReminderDisposition(value: unknown): value is ReminderDisposition {
  return typeof value === 'string' && (REMINDER_DISPOSITIONS as readonly string[]).includes(value);
}

/** 处置 → 发生记录结果 的唯一映射（不在实现里再写一遍分支） */
export const REMINDER_DISPOSITION_OUTCOME: Record<ReminderDisposition, ReminderOutcome> = {
  complete: 'DONE',
  snooze: 'SNOOZED',
  ignore: 'IGNORED',
};

/**
 * 重复规则词表：**字段先预留，首期只做单次提醒**（TECH-DESIGN §12.4 末句）。
 * 除 none 外一律明确拒绝，不静默降级成单次——否则站主以为设了每周提醒，实际只响一次。
 */
export const REMINDER_REPEAT_RULES = ['none', 'daily', 'weekly', 'monthly'] as const;
export type ReminderRepeatRule = (typeof REMINDER_REPEAT_RULES)[number];

export function isReminderRepeatRule(value: unknown): value is ReminderRepeatRule {
  return typeof value === 'string' && (REMINDER_REPEAT_RULES as readonly string[]).includes(value);
}

/** 未实现的重复规则：请求若带值，明确拒绝而不是假装支持。 */
export function isUnsupportedRepeatRule(value: unknown): boolean {
  if (value == null || value === '' || value === 'none') return false;
  return true;
}

/* ========== 提醒箱读模型（O04：api 产出 / admin 消费的唯一来源） ========== */

/**
 * 到期状态由**服务端**判定，前端只展示：不把「今天/逾期」的算法抄到浏览器里，
 * 否则服务端与界面会各算一份、跨时区时给出两个答案。
 */
export const REMINDER_DUE_STATES = ['overdue', 'today', 'upcoming', 'undated'] as const;
export type ReminderDueState = (typeof REMINDER_DUE_STATES)[number];

export interface ReminderInboxItem {
  actionId: string;
  title: string;
  note: string | null;
  status: ActionStatus;
  /** 站点本地日期（YYYY-MM-DD） */
  plannedDate: string | null;
  /** 到期 UTC 瞬时；未排期为 null */
  dueAt: string | null;
  /** 生成 dueAt 所用 IANA 时区 */
  timezone: string | null;
  dueState: ReminderDueState;
  /** 该事项当前到期的发生记录结果；无发生记录为 null（尚未扫描到） */
  occurrenceOutcome: ReminderOutcome | null;
  /** 已忽略的到期不再出现在「待处理」，但仍在记录里可见 */
  hasPendingOccurrence: boolean;
  /** 关联内容 slug（entityType==='CONTENT' 时） */
  contentSlug: string | null;
}

export interface ReminderInbox {
  /** 服务端视角的站点今天（YYYY-MM-DD），前端据此显示「今天」 */
  today: string;
  timezone: string;
  items: ReminderInboxItem[];
  counts: {
    overdue: number;
    today: number;
    upcoming: number;
    undated: number;
  };
  generatedAt: string;
}

/**
 * 到期分类（纯函数）：date 用站点本地日期比较，避免用 UTC 日期误判跨日。
 * undated = 没有到期瞬时的开放事项（未排期积压）。
 */
export function classifyReminderDue(input: {
  plannedDate: string | null;
  today: string;
}): ReminderDueState {
  if (input.plannedDate === null) return 'undated';
  if (input.plannedDate < input.today) return 'overdue';
  if (input.plannedDate === input.today) return 'today';
  return 'upcoming';
}

/** 提醒箱计数：只统计**未忽略**的开放项，忽略的不抬高待办数。 */
export function countReminderItems(items: readonly ReminderInboxItem[]): ReminderInbox['counts'] {
  const counts = { overdue: 0, today: 0, upcoming: 0, undated: 0 };
  for (const item of items) {
    if (item.occurrenceOutcome === 'IGNORED') continue;
    counts[item.dueState] += 1;
  }
  return counts;
}

/**
 * 内容更新复盘的只读视图（O08：HTTP 返回与前端消费的唯一合同）。
 * 关联 Action 与已核验发布版本，记录行为、观察、窗口、下一次尝试。
 */
export interface ReviewEntryView {
  id: string;
  actionId: string;
  releaseId: string | null;
  didWhat: string;
  observed: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  nextAttempt: string | null;
  evidenceState: ReviewEvidenceState;
  evidenceNote: string | null;
  createdBy: string;
  requestKey: string;
  createdAt: string;
  updatedAt: string;
}
