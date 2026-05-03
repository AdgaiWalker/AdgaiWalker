import { getCollection, type CollectionEntry } from 'astro:content';

export type ConceptEntry = CollectionEntry<'concepts'>;
export type LogEntry = CollectionEntry<'log'>;
export type LogType = LogEntry['data']['type'];

export const contentTypeOrder: LogType[] = [
  'article',
  'dialogue',
  'recipe',
  'prompt',
  'project',
  'video',
  'audio',
  'gallery',
  'photo',
  'thought',
];

export const contentTypeMeta: Record<LogType, { label: string; description: string }> = {
  article: {
    label: '文章',
    description: '深度长文和结构化思考',
  },
  dialogue: {
    label: '对话',
    description: '人机协作中的问题、判断和收获',
  },
  recipe: {
    label: '食谱',
    description: '食材、步骤和日常中的减法实践',
  },
  prompt: {
    label: '提示词',
    description: '可复用的意图表达和工作流片段',
  },
  project: {
    label: '项目',
    description: '成果展示和关键决策记录',
  },
  video: {
    label: '视频',
    description: '影像内容及其背后的思考',
  },
  audio: {
    label: '音频',
    description: '声音内容及分享理由',
  },
  gallery: {
    label: '图片集',
    description: '图像集合、背景和关联概念',
  },
  photo: {
    label: '摄影',
    description: '单组照片或视觉记录',
  },
  thought: {
    label: '随想',
    description: '短文本、瞬间判断和未展开的念头',
  },
};

export interface ConceptGraphNode {
  id: string;
  title: string;
  symbol: string;
  domain: string[];
  layer: number | null;
  contentCount: number;
  isJudgmentCore: boolean;
}

export interface ConceptGraphLink {
  source: string;
  target: string;
}

const judgmentCoreConceptIds = new Set([
  'happiness',
  'safety',
  'quality',
  'efficiency',
  'life-return',
  'ai-boundary',
  'problem-definition',
  'information-flow',
  'creative-leverage',
]);

export async function getActiveConcepts() {
  return getCollection('concepts', ({ data }) => data.status === 'active');
}

export async function getPublishedLogEntries() {
  const entries = await getCollection('log', ({ data }) => data.published);
  return entries.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function buildConceptCounts(entries: LogEntry[]) {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    for (const conceptId of entry.data.concepts ?? []) {
      counts.set(conceptId, (counts.get(conceptId) ?? 0) + 1);
    }
  }

  return counts;
}

export function getLayerConcepts(concepts: ConceptEntry[]) {
  return concepts
    .filter((concept) => concept.data.layer !== undefined)
    .sort((a, b) => (a.data.layer ?? 0) - (b.data.layer ?? 0));
}

export function groupDomainConcepts(concepts: ConceptEntry[]) {
  const groups = new Map<string, ConceptEntry[]>();

  for (const concept of concepts.filter((item) => item.data.layer === undefined)) {
    for (const domain of concept.data.domain) {
      if (!groups.has(domain)) groups.set(domain, []);
      groups.get(domain)!.push(concept);
    }
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-CN'));
}

export function getRelatedConcepts(concept: ConceptEntry, concepts: ConceptEntry[]) {
  const relatedIds = new Set(concept.data.related);

  for (const candidate of concepts) {
    if (candidate.id !== concept.id && candidate.data.related.includes(concept.id)) {
      relatedIds.add(candidate.id);
    }
  }

  return concepts.filter((candidate) => relatedIds.has(candidate.id) && candidate.id !== concept.id);
}

export function getEntriesForConcept(conceptId: string, entries: LogEntry[]) {
  return entries.filter((entry) => entry.data.concepts?.includes(conceptId));
}

export function groupEntriesByType(entries: LogEntry[]) {
  const groups = new Map<LogType, LogEntry[]>();

  for (const entry of entries) {
    if (!groups.has(entry.data.type)) groups.set(entry.data.type, []);
    groups.get(entry.data.type)!.push(entry);
  }

  return contentTypeOrder
    .filter((type) => groups.has(type))
    .map((type) => ({
      type,
      meta: contentTypeMeta[type],
      entries: groups.get(type)!,
    }));
}

export function buildConceptGraph(concepts: ConceptEntry[], entries: LogEntry[]) {
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  const counts = buildConceptCounts(entries);
  const linkKeys = new Set<string>();

  for (const concept of concepts) {
    for (const relatedId of concept.data.related) {
      if (!conceptIds.has(relatedId) || concept.id === relatedId) continue;
      const pair = [concept.id, relatedId].sort();
      linkKeys.add(`${pair[0]}::${pair[1]}`);
    }
  }

  const nodes: ConceptGraphNode[] = concepts.map((concept) => ({
    id: concept.id,
    title: concept.data.title,
    symbol: concept.data.symbol ?? '',
    domain: concept.data.domain,
    layer: concept.data.layer ?? null,
    contentCount: counts.get(concept.id) ?? 0,
    isJudgmentCore: judgmentCoreConceptIds.has(concept.id),
  }));

  const links: ConceptGraphLink[] = [...linkKeys].map((key) => {
    const [source, target] = key.split('::');
    return { source, target };
  });

  return { nodes, links, counts };
}

export function getConceptSummary(body: string | undefined) {
  if (!body) return '';

  return body
    .replace(/^---[\s\S]*?---/, '')
    .replace(/[#*_`\[\]()>|]/g, '')
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 10) ?? '';
}
