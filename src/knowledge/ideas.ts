import type { CollectionEntry } from 'astro:content';
import type { render } from 'astro:content';

import type { NeedCaseStats } from '@/conversation/store';
import { STATUS_WEIGHT } from '@/shared/constants';

export type IdeaEntry = CollectionEntry<'log'>;
export type RenderedIdeaContent = Awaited<ReturnType<typeof render>>['Content'];

export interface RenderedIdeaCard {
  entry: IdeaEntry;
  Content: RenderedIdeaContent;
  demandSignal: number;
  collaboratorCount?: number;
}

export const PUBLIC_DEMAND_SIGNAL_MIN = 5;

export function getDemandSignal(
  entry: Pick<IdeaEntry, 'data'>,
  stats: NeedCaseStats,
): number {
  const texts = [entry.data.title, entry.data.summary ?? '', ...(entry.data.tags ?? [])].join(' ').toLowerCase();
  let total = 0;

  for (const need of stats.topNeeds) {
    if (!need.summary) continue;
    const summary = need.summary.toLowerCase();

    for (const word of summary.split(/\s+/).filter((item) => item.length >= 2)) {
      if (texts.includes(word)) total += need.count;
    }

    for (const tag of entry.data.tags ?? []) {
      if (summary.includes(tag.toLowerCase())) total += need.count;
    }
  }

  return total;
}

export function sortIdeasByStatusAndDate(entries: IdeaEntry[]): IdeaEntry[] {
  return [...entries].sort((a, b) => {
    const weightA = STATUS_WEIGHT[a.data.status || 'thinking'] ?? 3;
    const weightB = STATUS_WEIGHT[b.data.status || 'thinking'] ?? 3;

    if (weightA !== weightB) return weightA - weightB;
    return b.data.date.getTime() - a.data.date.getTime();
  });
}
