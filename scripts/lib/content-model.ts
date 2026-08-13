export type AiUsePolicy = {
  level: string;
  readable: boolean;
  citable: boolean;
  actionable: boolean;
  reason: string;
};

export type ContentResource = {
  name: string;
  url: string;
  type: string;
  description: string;
};

export type GeneratedContentItem = {
  slug: string;
  title: string;
  date: string;
  updated: string;
  author: string;
  type: string;
  form: string;
  domain: string;
  intent: string;
  valueMode: string;
  status: string;
  summary: string;
  body: string;
  tags: string[];
  level: string;
  emoji: string;
  image: string;
  url: string;
  visibility: 'public' | 'draft' | 'private';
  published: boolean;
  hall: string;
  series: string;
  seriesOrder: number | null;
  related: string[];
  version: number | null;
  previousVersion: string;
  aiUsePolicy: AiUsePolicy;
  resources: ContentResource[];
};

export type GeneratedContent = {
  generatedAt?: string;
  items?: GeneratedContentItem[];
};

export const BROWSE_TYPES = new Set(['knowledge', 'idea', 'project', 'learn']);

export function getBrowseItems(
  items: readonly GeneratedContentItem[],
): GeneratedContentItem[] {
  return items.filter((item) => BROWSE_TYPES.has(item.type));
}

