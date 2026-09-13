/**
 * 观测查询用例（P2 数据页三标签的唯一数据源）。
 *
 * 边界：
 * - 只读聚合，不写入；近 N 天量小 → findMany + 内存 fold，不写复杂 SQL。
 * - 匿名红线：anonId 只用于 journey 的显式过滤，不返回身份、不落明文 IP。
 * - 空库 / 无 client 时返回零值结构，不抛错（数据页要能空着打开）。
 */
import { Inject, Injectable } from '@nestjs/common';
import { storageUnavailable } from '../common/http-error';
import { newId } from '../common/ids';
import {
  FEATURE_EVENT,
  type FeatureEventPort,
} from '../ports/feature-event.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';

const MS_DAY = 24 * 60 * 60 * 1000;

export const OBSERVABILITY_DEFAULT_DAYS = 30;
export const OBSERVABILITY_MAX_DAYS = 180;
const MAX_ROWS = 20_000;

export type UsageRow = { attempt: number; success: number; fail: number };

export interface UsageStatsView {
  days: number;
  /** ISO 周键（升序）：2026-W37 */
  weeks: string[];
  byFeature: Record<
    string,
    { guest: UsageRow; user: UsageRow; owner: UsageRow }
  >;
}

export interface AiStatsView {
  days: number;
  totalRuns: number;
  aiRuns: number;
  /** 0..1，三位小数 */
  aiRatio: number;
  degradeReasons: Array<{ reason: string; count: number }>;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  elapsedMs: { p50: number; p90: number };
  firstChunkMs: { p50: number; p90: number };
  dailyBudget: Array<{
    date: string;
    requests: number;
    tokensIn: number;
    tokensOut: number;
  }>;
}

export type JourneySource =
  | 'clue'
  | 'assistant'
  | 'search-miss'
  | 'content-feedback';

/** 管理侧事件写入入参（外部 agent 等；featureKey 字典校验在 HTTP 层） */
export type FeatureEventIngestInput = {
  featureKey: string;
  event: 'expose' | 'attempt' | 'success' | 'fail';
  actorType: 'guest' | 'user' | 'owner';
  failCode?: string | null;
  props?: Record<string, unknown> | null;
};

export interface JourneyEventView {
  at: string;
  source: JourneySource;
  actor: 'guest' | 'owner' | 'anonymous';
  text: string;
}

function normalizeDays(value: number, fallback = OBSERVABILITY_DEFAULT_DAYS): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), OBSERVABILITY_MAX_DAYS);
}

/** ISO-8601 周键（周一起算，跨年由周四所在年决定） */
export function isoWeekKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / MS_DAY + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function emptyUsageRow(): UsageRow {
  return { attempt: 0, success: 0, fail: 0 };
}

/** nearest-rank 分位（样本小，内存排序足够） */
function percentile(values: number[]): { p50: number; p90: number } {
  if (values.length === 0) return { p50: 0, p90: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? 0;
  return { p50: pick(0.5), p90: pick(0.9) };
}

@Injectable()
export class ObservabilityService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(FEATURE_EVENT) private readonly events: FeatureEventPort,
  ) {}

  /**
   * 管理侧事件写入（外部 agent 经 MCP 调用后的观测回写）。
   * 只落事件、不碰业务状态：记录不得改变业务结果。
   */
  async recordEvent(
    input: FeatureEventIngestInput,
  ): Promise<{ recorded: true }> {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    await this.events.record({
      id: newId(),
      featureKey: input.featureKey,
      event: input.event,
      actorType: input.actorType,
      failCode: input.failCode ?? null,
      props: input.props ?? null,
    });
    return { recorded: true };
  }

  /** 标签一：使用排行（FeatureEvent 按 featureKey × actorType；attempt/success/fail） */
  async usageStats(days: number): Promise<UsageStatsView> {
    const window = normalizeDays(days);
    const since = new Date(Date.now() - window * MS_DAY);
    const client = this.prisma.getClient();
    if (!client) return { days: window, weeks: [], byFeature: {} };

    const rows = await client.featureEvent.findMany({
      where: { at: { gte: since } },
      select: { at: true, featureKey: true, event: true, actorType: true },
      orderBy: { at: 'asc' },
      take: MAX_ROWS,
    });

    const weeks = new Set<string>();
    const byFeature: UsageStatsView['byFeature'] = {};
    for (const row of rows) {
      weeks.add(isoWeekKey(row.at));
      const actor =
        row.actorType === 'user'
          ? 'user'
          : row.actorType === 'owner'
            ? 'owner'
            : 'guest';
      const key =
        row.event === 'attempt'
          ? 'attempt'
          : row.event === 'success'
            ? 'success'
            : row.event === 'fail'
              ? 'fail'
              : null;
      if (!key) continue; // expose 属曝光，不进三列
      const buckets = (byFeature[row.featureKey] ??= {
        guest: emptyUsageRow(),
        user: emptyUsageRow(),
        owner: emptyUsageRow(),
      });
      buckets[actor][key] += 1;
    }

    return { days: window, weeks: [...weeks].sort(), byFeature };
  }

  /** 标签二：AI 观测（AssistantRun 聚合 + 日均预算消耗） */
  async aiStats(days: number): Promise<AiStatsView> {
    const window = normalizeDays(days);
    const since = new Date(Date.now() - window * MS_DAY);
    const empty: AiStatsView = {
      days: window,
      totalRuns: 0,
      aiRuns: 0,
      aiRatio: 0,
      degradeReasons: [],
      tokensIn: 0,
      tokensOut: 0,
      cacheReadTokens: 0,
      elapsedMs: { p50: 0, p90: 0 },
      firstChunkMs: { p50: 0, p90: 0 },
      dailyBudget: [],
    };
    const client = this.prisma.getClient();
    if (!client) return empty;

    const [runs, budgets] = await Promise.all([
      client.assistantRun.findMany({
        where: { createdAt: { gte: since } },
        select: {
          aiUsedFlag: true,
          elapsedMs: true,
          firstChunkMs: true,
          tokensIn: true,
          tokensOut: true,
          cacheReadTokens: true,
          degradeReason: true,
        },
        orderBy: { createdAt: 'asc' },
        take: MAX_ROWS,
      }),
      client.assistantBudget.findMany({ orderBy: { date: 'asc' } }),
    ]);

    let aiRuns = 0;
    let tokensIn = 0;
    let tokensOut = 0;
    let cacheReadTokens = 0;
    const reasons = new Map<string, number>();
    const elapsed: number[] = [];
    const firstChunk: number[] = [];

    for (const run of runs) {
      if (run.aiUsedFlag) aiRuns += 1;
      tokensIn += run.tokensIn;
      tokensOut += run.tokensOut;
      cacheReadTokens += run.cacheReadTokens;
      elapsed.push(run.elapsedMs);
      if (typeof run.firstChunkMs === 'number') firstChunk.push(run.firstChunkMs);
      if (run.degradeReason) {
        reasons.set(run.degradeReason, (reasons.get(run.degradeReason) ?? 0) + 1);
      }
    }

    const sinceDate = new Date(Date.now() - window * MS_DAY)
      .toISOString()
      .slice(0, 10);

    return {
      days: window,
      totalRuns: runs.length,
      aiRuns,
      aiRatio:
        runs.length > 0 ? Math.round((aiRuns / runs.length) * 1000) / 1000 : 0,
      degradeReasons: [...reasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      tokensIn,
      tokensOut,
      cacheReadTokens,
      elapsedMs: percentile(elapsed),
      firstChunkMs: percentile(firstChunk),
      dailyBudget: budgets
        .filter((row) => row.date >= sinceDate)
        .map((row) => ({
          date: row.date,
          requests: row.requests,
          tokensIn: row.tokensIn,
          tokensOut: row.tokensOut,
        })),
    };
  }

  /**
   * 标签三：旅程回放（四源按时间交错）。
   * 带 anonId = 只回放该访客可归属的两源（线索 + 助手）；
   * 不带 = 窗口内四源齐，无匿名键的两源标 anonymous。
   */
  async journey(days: number, anonId?: string): Promise<JourneyEventView[]> {
    const window = normalizeDays(days, 7);
    const since = new Date(Date.now() - window * MS_DAY);
    const client = this.prisma.getClient();
    if (!client) return [];

    const events: JourneyEventView[] = [];
    const byAt = (a: JourneyEventView, b: JourneyEventView) =>
      a.at.localeCompare(b.at);

    if (anonId) {
      const clues = await client.clue.findMany({
        where: { anonId, createdAt: { gte: since } },
        select: { body: true, source: true, createdAt: true },
      });
      for (const clue of clues) {
        events.push({
          at: clue.createdAt.toISOString(),
          source: 'clue',
          actor: clue.source === 'manual-self' ? 'owner' : 'guest',
          text: clue.body,
        });
      }

      const sessions = await client.assistantSession.findMany({
        where: { anonId },
        select: { sessionId: true },
      });
      const sessionIds = sessions.map((s) => s.sessionId);
      if (sessionIds.length > 0) {
        const runs = await client.assistantRun.findMany({
          where: { sessionId: { in: sessionIds }, createdAt: { gte: since } },
          select: { question: true, createdAt: true },
        });
        for (const run of runs) {
          events.push({
            at: run.createdAt.toISOString(),
            source: 'assistant',
            actor: 'guest',
            text: run.question,
          });
        }
      }
      return events.sort(byAt);
    }

    const [clues, runs, misses, feedbacks] = await Promise.all([
      client.clue.findMany({
        where: { createdAt: { gte: since } },
        select: { body: true, source: true, createdAt: true },
      }),
      client.assistantRun.findMany({
        where: { createdAt: { gte: since } },
        select: { question: true, createdAt: true },
      }),
      client.searchMiss.findMany({
        where: { createdAt: { gte: since } },
        select: { query: true, createdAt: true },
      }),
      client.contentFeedback.findMany({
        where: { createdAt: { gte: since } },
        select: { contentId: true, signal: true, createdAt: true },
      }),
    ]);

    for (const clue of clues) {
      events.push({
        at: clue.createdAt.toISOString(),
        source: 'clue',
        actor: clue.source === 'manual-self' ? 'owner' : 'guest',
        text: clue.body,
      });
    }
    for (const run of runs) {
      events.push({
        at: run.createdAt.toISOString(),
        source: 'assistant',
        actor: 'guest',
        text: run.question,
      });
    }
    for (const miss of misses) {
      events.push({
        at: miss.createdAt.toISOString(),
        source: 'search-miss',
        actor: 'anonymous',
        text: miss.query,
      });
    }
    for (const feedback of feedbacks) {
      events.push({
        at: feedback.createdAt.toISOString(),
        source: 'content-feedback',
        actor: 'anonymous',
        text: `${feedback.signal} · ${feedback.contentId}`,
      });
    }

    return events.sort(byAt);
  }
}
