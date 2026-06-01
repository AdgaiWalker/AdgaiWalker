import type { CollectionEntry } from 'astro:content';

import { buildPostPath, IDEAS, PROJECTS, TOOLS } from '@/lib/routes';

export type LogEntry = CollectionEntry<'log'>;

export type ContentForm = NonNullable<LogEntry['data']['form']>;
export type ContentDomain = NonNullable<LogEntry['data']['domain']>;
export type ContentIntent = NonNullable<LogEntry['data']['intent']>;
export type ValueMode = NonNullable<LogEntry['data']['valueMode']>;
export type ContentSpace = 'all' | 'progress' | 'life' | 'learning' | 'tools' | 'works' | 'ideas';

export interface ContentItem {
  id: string;
  title: string;
  href: string;
  summary?: string;
  date: Date;
  updated?: Date;
  tags: string[];
  type: LogEntry['data']['type'];
  form: ContentForm;
  domain: ContentDomain;
  intent: ContentIntent;
  valueMode: ValueMode;
  status?: LogEntry['data']['status'];
  rating?: number;
  isExternal: boolean;
  aiUseLevel: NonNullable<LogEntry['data']['aiUsePolicy']>['level'];
  related: string[];
  version?: number;
  previousVersion?: string;
  series?: string;
  seriesOrder?: number;
}

export interface ContentSpaceMeta {
  id: ContentSpace;
  label: string;
  hint: string;
  icon: string;
}

export const contentSpaces: ContentSpaceMeta[] = [
  { id: 'all', label: '全部内容', hint: '所有公开的文章、资源、点子与项目。', icon: 'lucide:sparkles' },
  { id: 'progress', label: '前进系统', hint: '关于个人系统、实践进度和阶段复盘。', icon: 'lucide:route' },
  { id: 'life', label: '生活现场', hint: '日常、情绪、旅行、料理与书法等生活记录。', icon: 'lucide:leaf' },
  { id: 'learning', label: '学习笔记', hint: '学习、教程、方法与可复用知识。', icon: 'lucide:book-open' },
  { id: 'tools', label: '工具资源', hint: '被验证或正在使用的工具、链接与资料。', icon: 'lucide:wrench' },
  { id: 'works', label: '作品项目', hint: '已经做出来或正在推进的项目与作品。', icon: 'lucide:folder-kanban' },
  { id: 'ideas', label: '点子火花', hint: '尚未完全成型但值得保存的想法。', icon: 'lucide:lightbulb' },
];

export const formLabels: Record<ContentForm, string> = {
  article: '文章',
  note: '笔记',
  diary: '日记',
  rant: '吐槽',
  gallery: '相册',
  video: '视频',
  recipe: '菜谱',
  calligraphy: '书法',
  resource: '资源',
  project: '项目',
  idea: '点子',
  lesson: '课程',
};

export const domainLabels: Record<ContentDomain, string> = {
  ai: 'AI',
  coding: '编程',
  product: '产品',
  philosophy: '哲学',
  life: '生活',
  cooking: '料理',
  calligraphy: '书法',
  reading: '阅读',
  travel: '旅行',
  emotion: '情绪',
  community: '社群',
};

export const intentLabels: Record<ContentIntent, string> = {
  think: '思考',
  record: '记录',
  teach: '教学',
  share: '分享',
  verify: '验证',
  showcase: '展示',
  reflect: '复盘',
  connect: '连接',
  vent: '表达',
};

export const valueModeLabels: Record<ValueMode, string> = {
  utility: '实用价值',
  existence: '存在价值',
  both: '实用与存在',
};

const LIFE_DOMAINS = new Set<ContentDomain>([
  'life',
  'cooking',
  'calligraphy',
  'reading',
  'travel',
  'emotion',
]);

const LEARNING_TYPES = new Set<LogEntry['data']['type']>(['learn', 'learning']);

export function inferForm(entry: LogEntry): ContentForm {
  if (entry.data.form) return entry.data.form;

  switch (entry.data.type) {
    case 'tool':
      return 'resource';
    case 'idea':
      return 'idea';
    case 'project':
      return 'project';
    case 'learn':
    case 'learning':
      return 'lesson';
    default:
      return 'article';
  }
}

export function inferDomain(entry: LogEntry): ContentDomain {
  if (entry.data.domain) return entry.data.domain;

  if (entry.data.type === 'community') return 'community';
  return 'ai';
}

export function inferIntent(entry: LogEntry): ContentIntent {
  if (entry.data.intent) return entry.data.intent;

  switch (entry.data.type) {
    case 'tool':
      return 'share';
    case 'idea':
      return 'think';
    case 'project':
      return 'showcase';
    case 'community':
      return 'connect';
    case 'learn':
    case 'learning':
      return 'teach';
    default:
      return entry.data.status === 'verified' ? 'verify' : 'record';
  }
}

export function inferValueMode(entry: LogEntry): ValueMode {
  if (entry.data.valueMode) return entry.data.valueMode;

  const domain = inferDomain(entry);
  if (entry.data.type === 'tool' || LEARNING_TYPES.has(entry.data.type)) return 'utility';
  if (entry.data.type === 'project') return 'both';
  if (LIFE_DOMAINS.has(domain)) return 'existence';
  return 'both';
}

function buildInternalHref(entry: LogEntry): string {
  switch (entry.data.type) {
    case 'tool':
      return TOOLS;
    case 'idea':
      return `${IDEAS}#${entry.id}`;
    case 'project':
      return PROJECTS;
    default:
      return buildPostPath(entry.id);
  }
}
















export function toContentItem(entry: LogEntry): ContentItem {
  const href = entry.data.url ?? buildInternalHref(entry);

  return {
    id: entry.id,
    title: entry.data.title,
    href,
    summary: entry.data.summary ?? entry.data.description,
    date: entry.data.date,
    updated: entry.data.updated,
    tags: entry.data.tags,
    type: entry.data.type,
    form: inferForm(entry),
    domain: inferDomain(entry),
    intent: inferIntent(entry),
    valueMode: inferValueMode(entry),
    status: entry.data.status,
    rating: entry.data.rating,
    isExternal: Boolean(entry.data.url),
    aiUseLevel: entry.data.aiUsePolicy?.level ?? 'AI-2',
    related: entry.data.related,
    version: entry.data.version,
    previousVersion: entry.data.previousVersion,
    series: entry.data.series,
    seriesOrder: entry.data.seriesOrder,
  };
}

export function itemBelongsToSpace(item: ContentItem, space: ContentSpace): boolean {
  switch (space) {
    case 'all':
      return true;
    case 'progress':
      return item.status === 'validating' || item.status === 'building' || item.tags.includes('前进系统') || item.id.includes('progress');
    case 'life':
      return LIFE_DOMAINS.has(item.domain);
    case 'learning':
      return LEARNING_TYPES.has(item.type) || item.form === 'lesson' || item.intent === 'teach';
    case 'tools':
      return item.type === 'tool';
    case 'works':
      return item.type === 'project';
    case 'ideas':
      return item.type === 'idea';
  }
}
