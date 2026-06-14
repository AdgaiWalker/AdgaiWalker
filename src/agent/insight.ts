import { randomUUID } from 'node:crypto';

import {
  audienceGroupLabels,
  needCategoryLabels,
  type NeedCategory,
} from '@/profiles/resource-index';
import {
  getTopicCandidateByClusterKey,
  getUnprocessedNeedCases,
  markNeedCasesTopicProcessed,
  saveTopicCandidates,
} from '@/conversation/store';
import type { NeedCase, TopicCandidate, TopicRoleDistribution } from '@/stores/ports';

function normalizeNeed(text: string): string {
  return text
    .replace(/[，。！？、；：,.!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeClusterKey(needCase: NeedCase): string {
  const category = needCase.needCategories[0] ?? 'content-navigation';
  const layer = needCase.frictionLayer ?? 'unclear';
  const ability = needCase.recommendedAbilityType ?? 'clarify';
  const role = normalizeNeed(
    needCase.profileSnapshot?.roleInContext
      ?? needCase.profileSnapshot?.personaAnchor
      ?? (needCase.audienceGroup ? audienceGroupLabels[needCase.audienceGroup] : '')
      ?? 'unknown',
  ).slice(0, 12) || 'unknown';
  return `${layer}:${ability}:${category}:${role}`;
}

function getRelatedContentIds(cases: NeedCase[]): string[] {
  const counts = new Map<string, number>();
  for (const needCase of cases) {
    for (const id of needCase.recommendedContentIds) {
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
  if (representativeNeed.includes('合规') || representativeNeed.includes('灰色') || representativeNeed.includes('绕过')) {
    return 'AI 合规入门：普通人如何选择可正常使用的工具路径';
  }
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

function buildRoleDistribution(cases: NeedCase[]): TopicRoleDistribution[] {
  const counts = new Map<string, number>();
  for (const needCase of cases) {
    // 优先用遭遇切片的场景化角色（roleInContext），回退自报锚点
    const slice = needCase.profileSnapshot;
    const role = slice?.roleInContext ?? slice?.personaAnchor;
    const fallbackRole = needCase.audienceGroup && needCase.audienceGroup !== 'prefer-not-say'
      ? audienceGroupLabels[needCase.audienceGroup]
      : '未主动说明的人群';
    const key = role || fallbackRole;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) => ({ role, count }));
}

function mergeRoleDistribution(
  current: TopicRoleDistribution[],
  next: TopicRoleDistribution[],
): TopicRoleDistribution[] {
  const counts = new Map<string, number>();
  for (const item of [...current, ...next]) {
    counts.set(item.role, (counts.get(item.role) ?? 0) + item.count);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) => ({ role, count }));
}

function uniqueRelatedContentIds(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const group of groups) {
    for (const id of group) {
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
  }
  return result.slice(0, 8);
}

function priorityFromDensity(density: number): TopicCandidate['priority'] {
  if (density >= 5) return 'high';
  if (density >= 2) return 'medium';
  return 'low';
}

export function createCandidate(cases: NeedCase[], clusterKey: string): TopicCandidate {
  const category = cases[0]?.needCategories[0] ?? 'content-navigation';
  const representativeNeed = cases[0]?.needSummary || cases[0]?.rawNeedRedacted || '用户想找到合适的 AI 工具';
  const hasComplianceRedirect = cases.some(c => c.safetyFlags.complianceRedirected);
  const relatedContentIds = getRelatedContentIds(cases);
  const density = cases.length;

  return {
    topicId: randomUUID(),
    clusterKey,
    createdAt: new Date().toISOString(),
    title: hasComplianceRedirect
      ? 'AI 合规入门：普通人如何选择可正常使用的工具路径'
      : createTopicTitle(category, representativeNeed),
    density,
    roleDistribution: buildRoleDistribution(cases),
    representativeNeed: hasComplianceRedirect
      ? '用户卡在账号、入口或访问边界，需要被转回可正常完成的 AI 实践路径。'
      : representativeNeed,
    relatedContentIds,
    priority: priorityFromDensity(density),
    status: 'observed',
    source: 'need-cluster',
  };
}

function mergeCandidate(existing: TopicCandidate, incoming: TopicCandidate): TopicCandidate {
  const density = existing.density + incoming.density;
  return {
    ...existing,
    density,
    roleDistribution: mergeRoleDistribution(existing.roleDistribution, incoming.roleDistribution),
    relatedContentIds: uniqueRelatedContentIds(existing.relatedContentIds, incoming.relatedContentIds),
    priority: priorityFromDensity(density),
    updatedAt: new Date().toISOString(),
  };
}

/** 规则聚类（默认，无外部模型依赖） */
export async function processPendingNeedCases(limit = 50): Promise<{
  processed: number;
  createdTopics: number;
  candidates: TopicCandidate[];
}> {
  const cases = await getUnprocessedNeedCases(limit);
  if (cases.length === 0) {
    return { processed: 0, createdTopics: 0, candidates: [] };
  }

  const clusters = new Map<string, NeedCase[]>();
  for (const needCase of cases) {
    const key = makeClusterKey(needCase);
    const list = clusters.get(key) ?? [];
    list.push(needCase);
    clusters.set(key, list);
  }

  const candidates: TopicCandidate[] = [];
  for (const [key, cases] of clusters.entries()) {
    const incoming = createCandidate(cases, key);
    const existing = await getTopicCandidateByClusterKey(key);
    const candidate = existing ? mergeCandidate(existing, incoming) : incoming;
    candidates.push(candidate);
  }

  await saveTopicCandidates(candidates);
  for (const candidate of candidates) {
    const clusteredCases = clusters.get(candidate.clusterKey) ?? [];
    await markNeedCasesTopicProcessed(clusteredCases.map(c => c.needCaseId), candidate.topicId);
  }

  return { processed: cases.length, createdTopics: candidates.length, candidates };
}
