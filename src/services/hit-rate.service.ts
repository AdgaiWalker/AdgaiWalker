import type { ContentItem } from '@/knowledge/content-model';
import type { ContentFeedbackEvent, ContentTelemetryEvent, FeedbackStatus, NeedCase, TopicCandidate } from '@/stores/ports';
import { getRedis } from '@/conversation/store';

/** 反馈细分维度（不含 none 未反馈） */
export const FEEDBACK_DIMENSIONS: FeedbackStatus[] = [
  'resolved', 'stuck', 'not-fit', 'want-tutorial',
  'first-draft', 'next-step-clear', 'wrong-direction', 'need-tutorial',
];
export const FEEDBACK_LABEL: Record<string, string> = {
  resolved: '解决',
  stuck: '仍卡',
  'not-fit': '不适合',
  'want-tutorial': '想看教程',
  'first-draft': '出第一版',
  'next-step-clear': '下一步清楚',
  'wrong-direction': '方向不对',
  'need-tutorial': '还缺教程',
};

export interface ContentHitRate {
  contentId: string;
  title: string;
  href: string;
  topicIds: string[];
  topicTitles: string[];
  totalCases: number;
  feedbackGiven: number;
  resolved: number;
  stuck: number;
  rate: number | null;
  /** 各反馈类型的细分计数（key 为 FeedbackStatus） */
  feedbackBreakdown: Record<string, number>;
}

function contentIdsForTopic(topic: TopicCandidate): string[] {
  const ids = new Set<string>();
  if (topic.producedContentSlug) ids.add(topic.producedContentSlug);
  for (const id of topic.relatedContentIds) ids.add(id);
  return [...ids];
}

function contentMatchesTopic(
  content: Pick<ContentItem, 'id' | 'sourceTopicId'>,
  topic: TopicCandidate,
): boolean {
  return content.sourceTopicId === topic.topicId || contentIdsForTopic(topic).includes(content.id);
}

export function calculateContentHitRates(input: {
  contents: Pick<ContentItem, 'id' | 'title' | 'href' | 'sourceTopicId'>[];
  topics: TopicCandidate[];
  needCases: NeedCase[];
}): ContentHitRate[] {
  const caseByTopic = new Map<string, NeedCase[]>();
  for (const needCase of input.needCases) {
    if (!needCase.topicCandidateId) continue;
    const list = caseByTopic.get(needCase.topicCandidateId) ?? [];
    list.push(needCase);
    caseByTopic.set(needCase.topicCandidateId, list);
  }

  const rows = new Map<string, ContentHitRate>();
  for (const topic of input.topics) {
    for (const content of input.contents) {
      if (!contentMatchesTopic(content, topic)) continue;

      const topicCases = caseByTopic.get(topic.topicId) ?? [];
      const existing = rows.get(content.id) ?? {
        contentId: content.id,
        title: content.title,
        href: content.href,
        topicIds: [],
        topicTitles: [],
        totalCases: 0,
        feedbackGiven: 0,
        resolved: 0,
        stuck: 0,
        rate: null,
        feedbackBreakdown: {} as Record<string, number>,
      };

      existing.topicIds.push(topic.topicId);
      existing.topicTitles.push(topic.title);
      existing.totalCases += topicCases.length;
      for (const item of topicCases) {
        if (item.feedbackStatus === 'none') continue;
        existing.feedbackGiven += 1;
        if (item.feedbackStatus === 'resolved') existing.resolved += 1;
        else if (item.feedbackStatus === 'stuck') existing.stuck += 1;
        existing.feedbackBreakdown[item.feedbackStatus] = (existing.feedbackBreakdown[item.feedbackStatus] ?? 0) + 1;
      }
      existing.rate = existing.feedbackGiven > 0
        ? Math.round((existing.resolved / existing.feedbackGiven) * 100)
        : null;
      rows.set(content.id, existing);
    }
  }

  return [...rows.values()].sort((a, b) => {
    const rateDiff = (b.rate ?? -1) - (a.rate ?? -1);
    if (rateDiff !== 0) return rateDiff;
    return b.feedbackGiven - a.feedbackGiven;
  });
}

/**
 * 点赞排行：keys Redis like:*（Upstash REST 的 keys 为 SCAN 封装，非阻塞）。
 * 点赞 key 数量 = 被点赞页面数级（小），仅 admin 后台调用；未点赞路径走 fallback 不入库。
 */
export async function getLikeLeaderboard(limit = 50): Promise<Array<{ path: string; count: number }>> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const keys = await redis.keys('like:*');
    const entries = await Promise.all(
      keys.map(async (key) => {
        const count = (await redis.get<number>(key)) ?? 0;
        return { path: key.slice('like:'.length), count };
      }),
    );
    return entries.filter(e => e.count > 0).sort((a, b) => b.count - a.count).slice(0, limit);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// P1-C01：双信号结果分组
//
// hai-razor 保留复杂度：MatchFeedback（需求匹配结果）与 ContentFeedback（内容阅读结果）
// 是两类不同问题，分开存储、分开计算、并列解释，不合并原始分母。
//
// matchOutcome  = NeedCase.feedbackStatus（需求匹配会话的结果）
// contentOutcome = ContentFeedbackEvent.signal（内容阅读后的明确反馈）
// 无反馈返回 null，不返回 0% 失败。
// ---------------------------------------------------------------------------

export interface MatchOutcomeGroup {
  totalCases: number;
  responded: number;
  resolved: number;
  unresolved: number;
  /** 命中率 = resolved / responded；无反馈返回 null，不返回 0 */
  rate: number | null;
}

export interface ContentOutcomeGroup {
  totalFeedback: number;
  useful: number;
  needsMore: number;
  outdated: number;
  /** 有用率 = useful / totalFeedback；无反馈返回 null */
  usefulRate: number | null;
}

/**
 * P3-A 阅读深度结果组（第三并列信号，与 matchOutcome / contentOutcome 不合并分母）。
 * uniqueReaders 用 readerToken 去重（per-page-load 随机 UUID）。
 * completionRate = completed / uniqueReaders；无阅读信号返回 null。
 */
export interface ReadingOutcomeGroup {
  /** 去重后的不同读者数（readerToken 维度） */
  uniqueReaders: number;
  /** 触发 content_complete 的读者数（去重） */
  completed: number;
  /** 至少发过一次 progress 信号的读者数（去重） */
  withProgressSignal: number;
  /** 完成率 = completed / uniqueReaders；无阅读信号返回 null */
  completionRate: number | null;
}

export interface ContentOutcomeSummary {
  contentId: string;
  title: string;
  href: string;
  /** 来源选题（可能多个内容对应同一选题，也可能无关联） */
  sourceTopicIds: string[];
  /** 缺失关联时显示"内容未关联来源选题"，不忽略 */
  hasSourceTopic: boolean;
  matchOutcome: MatchOutcomeGroup;
  contentOutcome: ContentOutcomeGroup;
  /** P3-A 阅读深度（第三并列信号，无数据时各计数为 0、completionRate 为 null） */
  readingOutcome: ReadingOutcomeGroup;
  /** 统计时间范围（取数据里最早 / 最晚时间） */
  timeRange: { from: string; to: string } | null;
}

function summarizeMatchOutcome(needCases: NeedCase[]): MatchOutcomeGroup {
  const totalCases = needCases.length;
  const responded = needCases.filter(c => c.feedbackStatus !== 'none').length;
  const resolved = needCases.filter(c => c.feedbackStatus === 'resolved').length;
  const unresolved = responded - resolved;
  return {
    totalCases,
    responded,
    resolved,
    unresolved,
    rate: responded > 0 ? Math.round((resolved / responded) * 100) : null,
  };
}

function summarizeContentOutcome(feedback: ContentFeedbackEvent[]): ContentOutcomeGroup {
  const totalFeedback = feedback.length;
  const useful = feedback.filter(f => f.signal === 'useful').length;
  const needsMore = feedback.filter(f => f.signal === 'needs-more').length;
  const outdated = feedback.filter(f => f.signal === 'outdated').length;
  return {
    totalFeedback,
    useful,
    needsMore,
    outdated,
    usefulRate: totalFeedback > 0 ? Math.round((useful / totalFeedback) * 100) : null,
  };
}

function summarizeReadingOutcome(telemetry: ContentTelemetryEvent[]): ReadingOutcomeGroup {
  if (telemetry.length === 0) {
    return { uniqueReaders: 0, completed: 0, withProgressSignal: 0, completionRate: null };
  }
  // 按 readerToken 聚合：一个 reader 是否有 progress / 是否 complete
  const readerProgress = new Set<string>();
  const readerComplete = new Set<string>();
  for (const ev of telemetry) {
    if (!ev.readerToken) continue;
    if (ev.eventType === 'content_progress') readerProgress.add(ev.readerToken);
    if (ev.eventType === 'content_complete') readerComplete.add(ev.readerToken);
  }
  // uniqueReaders = 出现过的所有 readerToken
  const uniqueReaders = new Set(telemetry.map(ev => ev.readerToken).filter(Boolean)).size;
  const withProgressSignal = readerProgress.size;
  const completed = readerComplete.size;
  return {
    uniqueReaders,
    completed,
    withProgressSignal,
    completionRate: uniqueReaders > 0 ? Math.round((completed / uniqueReaders) * 100) : null,
  };
}

function timeRangeOf(times: string[]): { from: string; to: string } | null {
  if (times.length === 0) return null;
  const sorted = [...times].sort();
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}

/**
 * 构建双信号结果分组。
 *
 * 输入：已发布内容、选题、NeedCase（用于 matchOutcome）、ContentFeedback（用于 contentOutcome）。
 * contentFeedback 按 contentId 预分组（由调用方从 store 读取并按内容聚合）。
 *
 * 关联路径：NeedCase.topicCandidateId → TopicCandidate → Content.sourceTopicId。
 * 一篇内容可能对应多个选题（relatedContentIds / producedContentSlug / sourceTopicId 任一命中）。
 */
export function buildContentOutcomeSummaries(input: {
  contents: Pick<ContentItem, 'id' | 'title' | 'href' | 'sourceTopicId'>[];
  topics: TopicCandidate[];
  needCases: NeedCase[];
  /** 按内容 ID 预聚合的内容反馈（来自 ContentFeedback store） */
  contentFeedbackByContent: Map<string, ContentFeedbackEvent[]>;
  /** 按内容 ID 预聚合的阅读深度遥测（来自 ContentTelemetry store，P3-A；可选） */
  contentTelemetryByContent?: Map<string, ContentTelemetryEvent[]>;
}): ContentOutcomeSummary[] {
  const { contents, topics, needCases, contentFeedbackByContent, contentTelemetryByContent } = input;

  // NeedCase 按 topicCandidateId 聚合
  const casesByTopic = new Map<string, NeedCase[]>();
  for (const needCase of needCases) {
    if (!needCase.topicCandidateId) continue;
    const list = casesByTopic.get(needCase.topicCandidateId) ?? [];
    list.push(needCase);
    casesByTopic.set(needCase.topicCandidateId, list);
  }

  const summaries: ContentOutcomeSummary[] = [];

  for (const content of contents) {
    // 找出关联此内容的所有选题
    const relatedTopicIds: string[] = [];
    for (const topic of topics) {
      if (contentMatchesTopic(content, topic)) {
        relatedTopicIds.push(topic.topicId);
      }
    }
    const sourceTopicId = content.sourceTopicId;
    if (sourceTopicId && !relatedTopicIds.includes(sourceTopicId)) {
      relatedTopicIds.push(sourceTopicId);
    }

    // 聚合这些选题下的 NeedCase
    const relatedCases: NeedCase[] = [];
    for (const topicId of relatedTopicIds) {
      const list = casesByTopic.get(topicId);
      if (list) relatedCases.push(...list);
    }

    const contentFeedback = contentFeedbackByContent.get(content.id) ?? [];
    const contentTelemetry = contentTelemetryByContent?.get(content.id) ?? [];

    const allTimes = [
      ...relatedCases.map(c => c.createdAt),
      ...contentFeedback.map(f => f.createdAt),
      ...contentTelemetry.map(t => t.createdAt),
    ];

    summaries.push({
      contentId: content.id,
      title: content.title,
      href: content.href,
      sourceTopicIds: relatedTopicIds,
      hasSourceTopic: relatedTopicIds.length > 0,
      matchOutcome: summarizeMatchOutcome(relatedCases),
      contentOutcome: summarizeContentOutcome(contentFeedback),
      readingOutcome: summarizeReadingOutcome(contentTelemetry),
      timeRange: timeRangeOf(allTimes),
    });
  }

  // 有任何反馈或关联的数据排前；纯无数据排后
  return summaries.sort((a, b) => {
    const aHas = a.matchOutcome.responded + a.contentOutcome.totalFeedback + a.readingOutcome.uniqueReaders;
    const bHas = b.matchOutcome.responded + b.contentOutcome.totalFeedback + b.readingOutcome.uniqueReaders;
    return bHas - aHas;
  });
}
