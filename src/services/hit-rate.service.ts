import type { ContentItem } from '@/knowledge/content-model';
import type { FeedbackStatus, NeedCase, TopicCandidate } from '@/stores/ports';
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
