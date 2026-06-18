import type { CollectionEntry } from 'astro:content';

export type ArticleEntry = CollectionEntry<'log'>;

export interface RelatedPostSummary {
  id: string;
  title: string;
  summary?: string;
  tags: string[];
  score: number;
}

export function stripArticleBody(body: string): string {
  return body
    .replace(/^---[\s\S]*?---/, '')
    .replace(/^import\s+.*$/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[#*_`\[\]()>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function summarizeArticleBody(
  body: string,
  charsPerMinute: number,
  maxDescriptionLength = 160,
): { cleanBody: string; description: string; readingTime: number } {
  const cleanBody = stripArticleBody(body);
  return {
    cleanBody,
    description: cleanBody.slice(0, maxDescriptionLength),
    readingTime: Math.max(1, Math.ceil(cleanBody.length / charsPerMinute)),
  };
}

export function getRelatedPosts(
  currentEntry: ArticleEntry,
  allEntries: ArticleEntry[],
  limit = 3,
): RelatedPostSummary[] {
  const currentTags = new Set(currentEntry.data.tags);

  return allEntries
    .filter((entry) => entry.id !== currentEntry.id)
    .map((entry) => ({
      id: entry.id,
      title: entry.data.title,
      summary: entry.data.summary,
      tags: entry.data.tags,
      score: entry.data.tags.filter((tag: string) => currentTags.has(tag)).length,
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
