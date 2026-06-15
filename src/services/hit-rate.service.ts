import type { ContentItem } from '@/knowledge/content-model';
import type { NeedCase, TopicCandidate } from '@/stores/ports';

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
      const feedbackCases = topicCases.filter(item => item.feedbackStatus !== 'none');
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
      };

      existing.topicIds.push(topic.topicId);
      existing.topicTitles.push(topic.title);
      existing.totalCases += topicCases.length;
      existing.feedbackGiven += feedbackCases.length;
      existing.resolved += feedbackCases.filter(item => item.feedbackStatus === 'resolved').length;
      existing.stuck += feedbackCases.filter(item => item.feedbackStatus === 'stuck').length;
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
