/**
 * Ideas 页编排服务 — 把"内容读取 + 需求统计聚合 + 渲染"组合成用例。
 *
 * knowledge/ideas 只保留纯计算函数（排序 / 需求信号打分）；
 * 跨层的数据读取（store 聚合、内容集合、astro render）集中在本服务，
 * 与 about/insights/mcp 直接消费 getNeedCaseStats 的既有模式一致。
 */

import type { CollectionEntry } from 'astro:content';
import { getNeedCaseStats, type NeedCaseStats } from '@/conversation/store';
import { getPublishedIdeas } from '@/knowledge/content';
import { getCollaboratorCountByContent } from '@/stores/collaborator.store';
import { createIdeaReactionStore } from '@/stores/idea-reaction.store';
import {
  getDemandSignal,
  sortIdeasByStatusAndDate,
  type IdeaEntry,
  type RenderedIdeaCard,
} from '@/knowledge/ideas';

export type { IdeaEntry, RenderedIdeaCard } from '@/knowledge/ideas';

export interface IdeasPageData {
  ideas: IdeaEntry[];
  renderedIdeas: (RenderedIdeaCard & { isCommunity: boolean; reactions?: any })[];
}

export interface IdeasService {
  /** 装配点子页：排序 + 渲染 + 计算每张卡的需求信号（取近 N 天 NeedCase 聚合）。 */
  getIdeasPageData(): Promise<IdeasPageData>;
}

export interface IdeasServiceDeps {
  /** 近多少天参与需求信号统计；默认 30。 */
  demandStatsDays?: number;
  /** 注入替代实现，便于测试；生产留空走真实 store。 */
  fetchDemandStats?: (options?: { days?: number }) => Promise<NeedCaseStats>;
  /** 注入替代实现，便于测试；生产留空走 content 集合。 */
  fetchIdeas?: () => Promise<IdeaEntry[]>;
  /** 注入替代实现，便于测试；生产留空走 astro:content render。 */
  renderEntry?: (entry: IdeaEntry) => Promise<{ Content: any }>;
}

export function createIdeasService(deps: IdeasServiceDeps = {}): IdeasService {
  const days = deps.demandStatsDays ?? 30;
  const fetchDemandStats = deps.fetchDemandStats ?? ((opts) => getNeedCaseStats(opts));
  const fetchIdeas = deps.fetchIdeas ?? (() => getPublishedIdeas());
  const renderEntry = deps.renderEntry ?? (async (entry) => {
    const { render } = await import('astro:content');
    return render(entry as CollectionEntry<'log'>);
  });

  return {
    async getIdeasPageData(): Promise<IdeasPageData> {
      const reactionStore = createIdeaReactionStore();
      
      const [staticIdeas, communityIdeasRaw, demandStats] = await Promise.all([
        fetchIdeas(),
        reactionStore.listCommunityIdeas(),
        fetchDemandStats({ days }),
      ]);

      const communityIdeas: IdeaEntry[] = communityIdeasRaw.map(item => ({
        id: item.id,
        collection: 'log' as const,
        data: {
          title: item.title,
          summary: item.summary,
          date: new Date(item.date),
          tags: item.tags,
          status: item.status,
          type: 'idea' as const,
          form: 'idea' as const,
          aiStructure: item.aiStructure,
        },
        body: item.rawInput,
      }));

      const allIdeas = [...staticIdeas, ...communityIdeas];
      const sortedIdeas = sortIdeasByStatusAndDate(allIdeas);

      const renderedIdeas = await Promise.all(
        sortedIdeas.map(async (entry) => {
          const isCommunity = entry.id.startsWith('community-idea-');
          const [contentResult, collaboratorCount, reactions] = await Promise.all([
            isCommunity
              ? null
              : renderEntry(entry),
            getCollaboratorCountByContent(entry.id),
            reactionStore.getReactions(entry.id),
          ]);

          return {
            entry,
            Content: contentResult ? contentResult.Content : null,
            isCommunity,
            demandSignal: getDemandSignal(entry, demandStats),
            collaboratorCount,
            reactions,
          };
        }),
      );

      return {
        ideas: sortedIdeas,
        renderedIdeas,
      };
    },
  };
}
