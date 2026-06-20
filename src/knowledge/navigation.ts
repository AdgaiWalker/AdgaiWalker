import { getPublishedContentItems } from '@/knowledge/content';
import type { ContentItem } from '@/knowledge/content-model';
import { ABOUT, CONTENT, HOME, IDEAS, LEARN, POSTS, PROJECTS, TOOLS } from '@/shared/routes';

export interface SearchItem {
  title: string;
  href: string;
  type: string;
  tags: string[];
}

export interface PageLink {
  label: string;
  href: string;
}

const TYPE_LABEL: Record<ContentItem['type'], string> = {
  knowledge: '思考',
  tool: '资源',
  idea: '点子',
  project: '项目',
  community: '社区',
  learn: '学习',
};

const TYPE_ORDER = ['思考', '资源', '点子', '项目', '学习', '社区'];

export const searchPageLinks: PageLink[] = [
  { label: '首页', href: HOME },
  { label: '思考', href: POSTS },
  { label: '资源', href: TOOLS },
  { label: '点子', href: IDEAS },
  { label: '项目', href: PROJECTS },
  { label: '学习', href: LEARN },
  { label: '内容', href: CONTENT },
  { label: '关于', href: ABOUT },
];

export function toSearchItem(item: ContentItem): SearchItem {
  return {
    title: item.title,
    href: item.href,
    type: TYPE_LABEL[item.type] ?? '其他',
    tags: item.tags ?? [],
  };
}

export async function getSearchModalData(): Promise<{ items: SearchItem[]; pages: PageLink[] }> {
  const items = (await getPublishedContentItems())
    .map(toSearchItem)
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));

  return {
    items,
    pages: searchPageLinks,
  };
}
