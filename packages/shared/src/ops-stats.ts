/**
 * 可追溯的运营统计（O06，PRD §12 / TECH-DESIGN §12.5）
 *
 * 三条诚实纪律，全部由纯函数在这里定义一次：
 *
 * 1. **按唯一实体计数**：提问数 = 唯一访客消息数（按消息 id），不是轮次数、不是事件数。
 *    重新生成只会新增 attempt 与助手消息，**不抬高提问数**；重复事件由唯一键去重。
 * 2. **缺失 ≠ 0**：没有任何一条运行记录带用量时，总量必须是 `null` 而不是 0——
 *    0 是"测到 0"，null 是"没测到"，两者含义不同，界面也不该显示成同一个数。
 * 3. **不制造没有分母的比率**：分母为 0 时一切比率返回 `null`，
 *    绝不用 0% 或 100% 冒充"留存率/转化率"。
 */

export const OPS_STATS_WINDOWS = ['24h', '7d', '30d'] as const;
export type OpsStatsWindow = (typeof OPS_STATS_WINDOWS)[number];

export function isOpsStatsWindow(value: unknown): value is OpsStatsWindow {
  return typeof value === 'string' && (OPS_STATS_WINDOWS as readonly string[]).includes(value);
}

const WINDOW_HOURS: Record<OpsStatsWindow, number> = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 };

export function resolveStatsWindow(
  window: OpsStatsWindow,
  now: Date,
): { window: OpsStatsWindow; from: string; to: string; hours: number } {
  const hours = WINDOW_HOURS[window];
  return {
    window,
    from: new Date(now.getTime() - hours * 60 * 60 * 1_000).toISOString(),
    to: now.toISOString(),
    hours,
  };
}

/** 提问事实：只认访客消息。重生成不产生访客消息，故提问数天然稳定。 */
export interface AskFacts {
  /** 唯一访客消息数（按消息 id 去重后的基数） */
  visitorMessages: number;
  /** 唯一会话数 */
  conversations: number;
  /** 轮次数（含重生成前的同一轮，仅作参照，不当作提问数） */
  turns: number;
  /** 重新生成尝试数（展示"重生成不抬高提问数"的证据） */
  regenerationAttempts: number;
}

export function countAsks(input: {
  visitorMessageIds: readonly string[];
  conversationIds: readonly string[];
  turnIds: readonly string[];
  /** 同一 turn 上多余的 attempt 数（第 1 次不算重生成） */
  attemptCountByTurn: readonly number[];
}): AskFacts {
  return {
    visitorMessages: new Set(input.visitorMessageIds).size,
    conversations: new Set(input.conversationIds).size,
    turns: new Set(input.turnIds).size,
    regenerationAttempts: input.attemptCountByTurn.reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0,
    ),
  };
}

/**
 * 回答结果分层：成功 / 降级 / 交付确认 / 未知**分开**计数，绝不合并成"成功"。
 * 「生成成功」不等于「访客收到」——交付确认是独立事实（delivery=ack）。
 */
export const DELIVERY_BUCKETS = ['ack', 'sent', 'pending', 'unknown'] as const;
export type DeliveryBucket = (typeof DELIVERY_BUCKETS)[number];

export interface AnswerFacts {
  /** 运行成功 **且** AI 实际产出且未降级 */
  succeeded: number;
  /** 走规则兜底：AI 不可用/失败后仍给出可用回答（aiUsedFlag=false 或带 degradeReason） */
  degraded: number;
  /** 运行明确失败或被取消（FAILED / CANCELLED） */
  failed: number;
  /** 交付确认：delivery=ack 的助手消息数（访客真的收到了） */
  deliveryAck: number;
  /** 未确认送达：sent/pending/unknown 合计（**不当作已送达**） */
  deliveryUnconfirmed: number;
  /** 状态无法判定（UNKNOWN / 缺关联 / aiUsedFlag 缺失）。绝不并进 succeeded。 */
  unknown: number;
}

/** 明确的失败态词表（与 ExecutionRun.state 口径一致） */
const FAILED_RUN_STATES = new Set(['FAILED', 'CANCELLED']);

export function countAnswers(input: {
  assistantMessages: readonly { delivery: string }[];
  runs: readonly { state: string; aiUsedFlag: boolean | null; degradeReason: string | null }[];
}): AnswerFacts {
  let succeeded = 0;
  let degraded = 0;
  let failed = 0;
  let unknown = 0;
  for (const run of input.runs) {
    // 先看状态：失败/取消绝不算成功，也不伪装成"降级但可用"
    if (FAILED_RUN_STATES.has(run.state)) {
      failed += 1;
    } else if (run.state === 'UNKNOWN' || run.aiUsedFlag === null) {
      // 状态或 AI 标记不可判定 → 如实记 unknown
      unknown += 1;
    } else if (!run.aiUsedFlag || run.degradeReason !== null) {
      degraded += 1;
    } else {
      succeeded += 1;
    }
  }
  const ack = input.assistantMessages.filter((message) => message.delivery === 'ack').length;
  return {
    succeeded,
    degraded,
    failed,
    deliveryAck: ack,
    deliveryUnconfirmed: input.assistantMessages.length - ack,
    unknown,
  };
}

/**
 * 用量覆盖：**分母是运行数，分子是带用量的运行数**。
 * 一条都没有时 total 是 null（不是 0），并给出覆盖率供界面标注"数据不完整"。
 */
export interface UsageCoverage {
  runs: number;
  runsWithUsage: number;
  /** 0–1；分母为 0 时为 null（没有分母就不给比率） */
  coverage: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  totalTokens: number | null;
}

export function summarizeUsage(
  runs: readonly { tokensIn: number | null; tokensOut: number | null }[],
): UsageCoverage {
  // 只把**明确记录**的用量计入：null 表示缺失，不当 0
  const measured = runs.filter((run) => run.tokensIn !== null || run.tokensOut !== null);
  if (measured.length === 0) {
    return {
      runs: runs.length,
      runsWithUsage: 0,
      coverage: runs.length === 0 ? null : 0,
      tokensIn: null,
      tokensOut: null,
      totalTokens: null,
    };
  }
  const tokensIn = measured.reduce((sum, run) => sum + (run.tokensIn ?? 0), 0);
  const tokensOut = measured.reduce((sum, run) => sum + (run.tokensOut ?? 0), 0);
  return {
    runs: runs.length,
    runsWithUsage: measured.length,
    coverage: runs.length === 0 ? null : measured.length / runs.length,
    tokensIn,
    tokensOut,
    totalTokens: tokensIn + tokensOut,
  };
}

/**
 * 比率只在分母有意义时给出。
 * 分母为 0、负数或非有限数一律 null——**不制造没有分母的留存率/转化率**。
 */
export function rateOrNull(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/** 统计口径的可追溯声明：每个数字都说得清来自哪张表、哪个窗口。 */
export interface StatsProvenance {
  window: OpsStatsWindow;
  from: string;
  to: string;
  /** 窗口长度（小时），供界面直接显示而不用自己算 */
  hours: number;
  /** 数据来源（表/模型名），供站主核对数字出处 */
  sources: string[];
  /** 缺失覆盖：哪些口径有缺失、缺失比例 */
  missing: Array<{ key: string; note: string; coverage: number | null }>;
}

export interface OpsOverviewStats {
  provenance: StatsProvenance;
  asks: AskFacts;
  answers: AnswerFacts;
  usage: UsageCoverage;
  /** 提醒与处置事实（O01–O03 的既有数据，不重复造表） */
  reminders: {
    open: number;
    overdue: number;
    occurrencesCreated: number;
    resolved: { done: number; snoozed: number; ignored: number };
  };
  /** 内容与发布事实 */
  content: {
    changes: number;
    releases: number;
    published: number;
    publicationAvailable: boolean;
    /** 各阶段条目数（台账派生阶段，非人工字段） */
    stages: { draft: number; review: number; ready: number; live: number };
    /**
     * 内容三版本状态（C15 证据口径）：工作区 hash 与线上已确证 hash、问答索引 hash 是否一致。
     * 三个"不一致"分开计，便于下钻到具体文章。
     */
    versionStates: {
      /** 当前公开投影与最近一次已确证发布的同命名空间 hash 不同。 */
      workingAhead: number;
      /** 已发布且当前激活索引 hash 与确证 hash 不同。 */
      indexBehind: number;
      /** 已发布但当前索引 hash 缺失或不可读取。 */
      indexUnknown: number;
      /** 已发布且公开投影与索引都匹配确证版本。 */
      inSync: number;
    };
  };
  /**
   * 下钻目标：概览里每个数字都能追到同一筛选的明细。
   * `filter` 直接拼到目标页查询串，保证"数字 → 明细"口径一致。
   */
  drilldowns: Array<{
    key: string;
    label: string;
    count: number;
    route: 'content' | 'records' | 'agents' | 'overview';
    /** 目标页查询串（不含 ?）；无筛选为空串 */
    filter: string;
  }>;
}
