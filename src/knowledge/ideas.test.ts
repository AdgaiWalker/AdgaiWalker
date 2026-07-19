import { describe, expect, it, vi } from 'vitest';

import type { NeedCaseStats } from '@/conversation/store';

vi.mock('@/knowledge/content', () => ({
  getPublishedIdeas: vi.fn(),
}));

import { getDemandSignal, sortIdeasByStatusAndDate, type IdeaEntry } from './ideas';

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
  topNeeds: [],
  dailyTrend: [],
};

describe('getDemandSignal', () => {
  it('aggregates matches from title, summary, and tags', () => {
    const stats: NeedCaseStats = {
      ...emptyStats,
      topNeeds: [
        { summary: 'AI 表单 自动化', count: 3 },
        { summary: '知识库 检索', count: 2 },
      ],
    };

    const score = getDemandSignal(
      makeIdea({
        title: 'AI 表单助手',
        summary: '帮团队自动化整理报名信息',
        tags: ['知识库'],
      }),
      stats,
    );

    expect(score).toBeGreaterThanOrEqual(5);
  });
});

describe('sortIdeasByStatusAndDate', () => {
  it('keeps lower status weight first and newer items first inside the same status', () => {
    const ideas = sortIdeasByStatusAndDate([
      makeIdea({ id: 'verified', status: 'verified', date: new Date('2026-06-03') }),
      makeIdea({ id: 'thinking-old', status: 'thinking', date: new Date('2026-06-01') }),
      makeIdea({ id: 'thinking-new', status: 'thinking', date: new Date('2026-06-05') }),
    ]);

    expect(ideas.map((item) => item.id)).toEqual(['thinking-new', 'thinking-old', 'verified']);
  });
});
