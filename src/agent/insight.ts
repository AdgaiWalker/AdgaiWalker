import { randomUUID } from 'node:crypto';

import {
  aiStageLabels,
  audienceGroupLabels,
  matchResources,
  needCategoryLabels,
  type NeedCategory,
} from '@/profiles/resource-index';
import {
  getPendingDemandEvents,
  markDemandEventsProcessed,
  saveTopicCandidates,
  type DemandEvent,
  type TopicCandidate,
} from '@/conversation/store';

function normalizeNeed(text: string): string {
  return text
    .replace(/[，。！？、；：,.!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeClusterKey(event: DemandEvent): string {
  const category = event.needCategories[0] ?? 'content-navigation';
  const normalized = normalizeNeed(event.needSummary || event.rawNeedRedacted);
  const head = normalized.slice(0, 18);
  return `${category}:${head}`;
}

function getRelatedContentIds(events: DemandEvent[]): string[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    for (const id of event.recommendedContentIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);
}

function createTopicTitle(category: NeedCategory, representativeNeed: string): string {
  const label = needCategoryLabels[category] ?? 'AI 工具选择';
  if (representativeNeed.includes('怎么开始') || representativeNeed.includes('从哪开始')) {
    return `${label}：新手第一步到底该做什么`;
  }
  if (representativeNeed.includes('做网站') || representativeNeed.includes('做网页')) {
    return `${label}：零基础做网站的第一步`;
  }
  if (representativeNeed.includes('报名表') || representativeNeed.includes('收集信息')) {
    return `${label}：信息收集与整理的快速方案`;
  }
  return `${label}：${representativeNeed.slice(0, 24)}`;
}

function summarizeAudience(events: DemandEvent[]): string {
  const labels = new Set<string>();
  for (const event of events) {
    if (event.audienceGroup && event.audienceGroup !== 'prefer-not-say') {
      labels.add(audienceGroupLabels[event.audienceGroup]);
    }
    if (event.aiStage && event.aiStage !== 'prefer-not-say') {
      labels.add(aiStageLabels[event.aiStage]);
    }
  }
  return labels.size > 0 ? [...labels].join(' / ') : '未主动说明的人群';
}

function createCandidate(events: DemandEvent[]): TopicCandidate {
  const category = events[0]?.needCategories[0] ?? 'content-navigation';
  const representativeNeed = events[0]?.needSummary || events[0]?.rawNeedRedacted || '用户想找到合适的 AI 工具';
  const relatedContentIds = getRelatedContentIds(events);
  const relatedTitles = relatedContentIds
    .map(id => matchResources.find(resource => resource.id === id)?.title)
    .filter(Boolean)
    .join('、');

  return {
    topicId: randomUUID(),
    createdAt: new Date().toISOString(),
    title: createTopicTitle(category, representativeNeed),
    audience: summarizeAudience(events),
    coreQuestion: representativeNeed,
    contentAngle: relatedTitles
      ? `围绕这个问题，用 ${relatedTitles} 串成一条低认知成本路径。`
      : '围绕这个问题补一条更清晰的站内资料路径。',
    sourceNeedCount: events.length,
    relatedContentIds,
    priority: events.length >= 5 ? 'high' : events.length >= 2 ? 'medium' : 'low',
    status: 'pending',
  };
}

export async function processPendingDemandEvents(limit = 50): Promise<{
  processed: number;
  createdTopics: number;
  candidates: TopicCandidate[];
}> {
  const events = await getPendingDemandEvents(limit);
  if (events.length === 0) {
    return { processed: 0, createdTopics: 0, candidates: [] };
  }

  const clusters = new Map<string, DemandEvent[]>();
  for (const event of events) {
    const key = makeClusterKey(event);
    const list = clusters.get(key) ?? [];
    list.push(event);
    clusters.set(key, list);
  }

  const candidates = [...clusters.values()].map(createCandidate);
  await saveTopicCandidates(candidates);
  await markDemandEventsProcessed(events.map(event => event.eventId));

  return {
    processed: events.length,
    createdTopics: candidates.length,
    candidates,
  };
}
