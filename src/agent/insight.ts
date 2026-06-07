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

/** 规则聚类（默认，无 API 依赖） */
export async function processPendingDemandEvents(limit = 50): Promise<{
  processed: number;
  createdTopics: number;
  candidates: TopicCandidate[];
}> {
  const events = await getPendingDemandEvents(limit);
  if (events.length === 0) {
    return { processed: 0, createdTopics: 0, candidates: [] };
  }

  // 如果有 Claude API key，尝试增强分析
  if (import.meta.env.ANTHROPIC_API_KEY && events.length >= 3) {
    try {
      return await processWithModel(events);
    } catch {
      // 降级到规则聚类
    }
  }

  return processWithRules(events);
}

/** 规则聚类 */
async function processWithRules(events: DemandEvent[]) {
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

  return { processed: events.length, createdTopics: candidates.length, candidates };
}

/** Claude API 增强聚类 */
async function processWithModel(events: DemandEvent[]) {
  // 先用规则做粗聚类
  const ruleClusters = new Map<string, DemandEvent[]>();
  for (const event of events) {
    const key = makeClusterKey(event);
    const list = ruleClusters.get(key) ?? [];
    list.push(event);
    ruleClusters.set(key, list);
  }

  // 让 Claude 做语义再聚类 + 内容缺口判断
  const clusterSummaries = [...ruleClusters.entries()].map(([key, evts]) => ({
    key,
    count: evts.length,
    needs: evts.slice(0, 3).map(e => e.needSummary || e.rawNeedRedacted),
    categories: [...new Set(evts.flatMap(e => e.needCategories))],
    relatedContent: [...new Set(evts.flatMap(e => e.recommendedContentIds))],
  }));

  const siteContent = matchResources.map(r => `ID:${r.id} 标题:${r.title}`).join('\n');

  const prompt = `你是内容选题分析师。以下是用户需求聚类摘要，请做语义再聚类和内容缺口分析。

需求聚类：
${clusterSummaries.map((c, i) => `[${i}] (${c.count}条) ${c.needs.join(' / ')} | 类别:${c.categories.join(',')} | 关联:${c.relatedContent.join(',') || '无'}`).join('\n')}

站内已有内容：
${siteContent}

任务：
1. 将语义相似的聚类合并
2. 判断站内内容是否已覆盖（内容缺口）
3. 为每个最终聚类生成一个选题候选

返回 JSON 数组，每项：
{
  "sourceIndices": [0, 2],
  "title": "选题标题",
  "coreQuestion": "用户核心问题",
  "contentAngle": "建议的内容角度和站内资料串联方式",
  "isContentGap": true,
  "priority": "high"
}

priority 标准：需求 ≥5 条 high，≥2 条 medium，其他 low。
只返回 JSON 数组，不要其他内容。`;

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`model error: ${response.status}`);

    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (typeof text !== 'string') throw new Error('no text');

    const jsonText = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(jsonText);

    if (!Array.isArray(parsed)) throw new Error('not array');

    // 将模型结果转换为 TopicCandidate
    const candidates: TopicCandidate[] = parsed.map((item: Record<string, unknown>) => {
      const indices = Array.isArray(item.sourceIndices) ? item.sourceIndices as number[] : [];
      const matchedEvents = indices
        .map((i: number) => clusterSummaries[i])
        .filter(Boolean)
        .flatMap(c => ruleClusters.get(c.key) ?? []);

      const allEvents = matchedEvents.length > 0 ? matchedEvents : events.slice(0, 1);
      const totalCount = matchedEvents.length > 0
        ? indices.reduce((sum: number, i: number) => sum + (clusterSummaries[i]?.count ?? 0), 0)
        : 1;

      return {
        topicId: randomUUID(),
        createdAt: new Date().toISOString(),
        title: String(item.title || '未命名选题'),
        audience: summarizeAudience(allEvents),
        coreQuestion: String(item.coreQuestion || ''),
        contentAngle: String(item.contentAngle || ''),
        sourceNeedCount: totalCount,
        relatedContentIds: getRelatedContentIds(allEvents),
        priority: (['high', 'medium', 'low'].includes(item.priority as string) ? item.priority : 'low') as TopicCandidate['priority'],
        status: 'pending' as const,
      };
    });

    await saveTopicCandidates(candidates);
    await markDemandEventsProcessed(events.map(event => event.eventId));

    return { processed: events.length, createdTopics: candidates.length, candidates };
  } finally {
    clearTimeout(timer);
  }
}
