import { describe, expect, it, vi } from 'vitest';

import { createIdeasService } from './ideas.service';
import type { IdeaEntry } from '@/knowledge/ideas';
import type { NeedCaseStats } from '@/conversation/store';

// ideas.service 顶层 import @/knowledge/content（后者 import astro:content 虚拟模块，
// vitest 无 astro 插件无法解析）。测试通过 deps 注入 fetchIdeas，生产路径不会触发，
// 此 mock 仅阻断模块加载期的顶层 import 解析。
vi.mock('@/knowledge/content', () => ({ getPublishedIdeas: vi.fn() }));
vi.mock('@/conversation/store', () => ({ getNeedCaseStats: vi.fn() }));

function makeIdea(partial: Partial<IdeaEntry['data']> & { id?: string } = {}): IdeaEntry {
  return {
    id: partial.id ?? 'idea',
    body: '',
    collection: 'log',
    data: {
      title: '默认点子',
      date: new Date('2026-06-01'),
      tags: [],
      type: 'idea',
      status: 'thinking',
      ...partial,
    },
  } as unknown as IdeaEntry;
}

const emptyStats: NeedCaseStats = {
  totalCases: 0,
  totalSessions: 0,
  byCategory: {},
  byFrictionLayer: {},
  byAbilityType: {},
  byFeedbackType: {},
  byReviewStatus: {},
  complianceRedirectRate: 0,
  codeAgentMisuseRate: 0,
  topNeeds: [{ summary: 'AI 表单 自动化', count: 3 }],
  dailyTrend: [],
};

describe('createIdeasService', () => {
  it('calls demand stats with the configured window and threads signal into rendered cards', async () => {
    const fetchDemandStats = vi.fn().mockResolvedValue(emptyStats);
    const fetchIdeas = vi.fn().mockResolvedValue([
      makeIdea({ id: 'a', title: 'AI 表单助手', status: 'thinking', date: new Date('2026-06-05') }),
      makeIdea({ id: 'b', title: '无关点子', status: 'verified', date: new Date('2026-06-01') }),
    ]);
    const renderEntry = vi.fn().mockImplementation(async (entry: IdeaEntry) => ({
      Content: (() => null) as unknown as ReturnType<typeof Object>,
    }));

    const service = createIdeasService({
      demandStatsDays: 7,
      fetchDemandStats,
      fetchIdeas,
      renderEntry,
    });

    const data = await service.getIdeasPageData();

    // 编排：按配置窗口拉取需求统计
    expect(fetchDemandStats).toHaveBeenCalledWith({ days: 7 });
    // 排序：thinking(3) 在 verified(更高权重) 前；weight 相同时按日期降序
    expect(data.ideas.map((i) => i.id)).toEqual(['a', 'b']);
    // 渲染：每条都过 renderEntry
    expect(renderEntry).toHaveBeenCalledTimes(2);
    // 需求信号透传到卡片
    expect(data.renderedIdeas[0].demandSignal).toBeGreaterThan(0);
    expect(data.renderedIdeas[1].demandSignal).toBe(0);
  });

  it('defaults demand window to 30 days when not specified', async () => {
    const fetchDemandStats = vi.fn().mockResolvedValue(emptyStats);
    const fetchIdeas = vi.fn().mockResolvedValue([]);
    const renderEntry = vi.fn();

    const service = createIdeasService({ fetchDemandStats, fetchIdeas, renderEntry });
    await service.getIdeasPageData();

    expect(fetchDemandStats).toHaveBeenCalledWith({ days: 30 });
  });
});
