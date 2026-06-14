import { randomUUID } from 'node:crypto';

import {
  aiStageLabels,
  audienceGroupLabels,
  matchResources,
  needCategoryLabels,
  type NeedCategory,
} from '@/profiles/resource-index';
import {
  getUnprocessedNeedCases,
  markNeedCasesTopicProcessed,
  saveTopicCandidates,
} from '@/conversation/store';
import type { NeedCase, TopicCandidate } from '@/stores/ports';

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
  const normalized = normalizeNeed(needCase.needSummary || needCase.rawNeedRedacted);
  const head = normalized.slice(0, 18);
  return `${layer}:${ability}:${category}:${head}`;
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

function summarizeAudience(cases: NeedCase[]): string {
  const labels = new Set<string>();
  for (const needCase of cases) {
    // 优先用遭遇切片的场景化角色（roleInContext），回退自报锚点
    const slice = needCase.profileSnapshot;
    const role = slice?.roleInContext ?? slice?.personaAnchor;
    if (role) labels.add(role);
    // 补充信号：顶层 audienceGroup（兼容无切片的旧 case）
    if (needCase.audienceGroup && needCase.audienceGroup !== 'prefer-not-say') {
      labels.add(audienceGroupLabels[needCase.audienceGroup]);
    }
  }
  return labels.size > 0 ? [...labels].join(' / ') : '未主动说明的人群';
}

function createCandidate(cases: NeedCase[], clusterKey: string): TopicCandidate {
  const category = cases[0]?.needCategories[0] ?? 'content-navigation';
  const representativeNeed = cases[0]?.needSummary || cases[0]?.rawNeedRedacted || '用户想找到合适的 AI 工具';
  const hasComplianceRedirect = cases.some(c => c.safetyFlags.complianceRedirected);
  const relatedContentIds = getRelatedContentIds(cases);
  const relatedTitles = relatedContentIds
    .map(id => matchResources.find(resource => resource.id === id)?.title)
    .filter(Boolean)
    .join('、');

  return {
    topicId: randomUUID(),
    clusterKey,
    createdAt: new Date().toISOString(),
    title: hasComplianceRedirect
      ? 'AI 合规入门：普通人如何选择可正常使用的工具路径'
      : createTopicTitle(category, representativeNeed),
    audience: summarizeAudience(cases),
    coreQuestion: hasComplianceRedirect
      ? '用户卡在账号、入口或访问边界，需要被转回可正常完成的 AI 实践路径。'
      : representativeNeed,
    contentAngle: hasComplianceRedirect
      ? '只做合规普及：解释官方入口、账号配置、中文学习路径和可正常使用工具，不提供绕过限制或灰色渠道。'
      : relatedTitles
      ? `围绕这个问题，用 ${relatedTitles} 串成一条低认知成本路径。`
      : '围绕这个问题补一条更清晰的站内资料路径。',
    sourceNeedCount: cases.length,
    relatedContentIds,
    priority: cases.length >= 5 ? 'high' : cases.length >= 2 ? 'medium' : 'low',
    status: 'pending',
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

  const candidates = [...clusters.entries()].map(([key, cases]) => createCandidate(cases, key));
  await saveTopicCandidates(candidates);
  await markNeedCasesTopicProcessed(cases.map(c => c.needCaseId));

  return { processed: cases.length, createdTopics: candidates.length, candidates };
}
