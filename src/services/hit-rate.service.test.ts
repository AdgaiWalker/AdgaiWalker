import { describe, expect, it } from 'vitest';

import { calculateContentHitRates } from '@/services/hit-rate.service';
import type { NeedCase, TopicCandidate } from '@/stores/ports';

function createTopic(overrides: Partial<TopicCandidate> = {}): TopicCandidate {
  return {
    topicId: 'topic-hit-rate',
    clusterKey: 'scenario-match:learning-path:learn-ai:学生',
    createdAt: new Date().toISOString(),
    title: 'AI 入门学习：新手第一步到底该做什么',
    density: 2,
    roleDistribution: [{ role: '学生', count: 2 }],
    representativeNeed: '用户不知道学习 AI 的第一步该做什么',
    relatedContentIds: ['ai-first-step'],
    priority: 'medium',
    status: 'produced',
    source: 'need-cluster',
    producedContentSlug: 'ai-first-step',
    ...overrides,
  };
}

function createNeedCase(overrides: Partial<NeedCase>): NeedCase {
  const now = new Date().toISOString();
  return {
    needCaseId: overrides.needCaseId ?? crypto.randomUUID(),
    sessionId: overrides.sessionId ?? crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    sourcePage: '/tools',
    rawNeedRedacted: '我想学 AI',
    needSummary: '我想学 AI',
    needCategories: ['learn-ai'],
    recommendedContentIds: ['ai-first-step'],
    recommendedToolIds: [],
    agentRecommendation: {
      responseMode: 'recommendation',
      bridge: '先从一个小任务开始。',
      fallbackUsed: false,
      resourceIds: [],
      recommendedTools: [],
    },
    feedbackStatus: 'none',
    adminReviewStatus: 'pending',
    safetyFlags: {
      piiDetected: false,
      piiRemoved: false,
      isMinorContext: false,
      complianceRedirected: false,
      consentForTopic: true,
    },
    ...overrides,
  };
}

describe('calculateContentHitRates', () => {
  it('aggregates resolved and stuck feedback by published content', () => {
    const [row] = calculateContentHitRates({
      contents: [{ id: 'ai-first-step', title: 'AI 第一步', href: '/posts/ai-first-step' }],
      topics: [createTopic()],
      needCases: [
        createNeedCase({ needCaseId: 'need-1', topicCandidateId: 'topic-hit-rate', feedbackStatus: 'resolved' }),
        createNeedCase({ needCaseId: 'need-2', topicCandidateId: 'topic-hit-rate', feedbackStatus: 'stuck' }),
        createNeedCase({ needCaseId: 'need-3', topicCandidateId: 'topic-hit-rate', feedbackStatus: 'none' }),
      ],
    });

    expect(row.contentId).toBe('ai-first-step');
    expect(row.resolved).toBe(1);
    expect(row.stuck).toBe(1);
    expect(row.feedbackGiven).toBe(2);
    expect(row.totalCases).toBe(3);
    expect(row.rate).toBe(50);
  });

  it('ignores topic content ids that are not published content', () => {
    const rows = calculateContentHitRates({
      contents: [{ id: 'published-only', title: '已发布', href: '/posts/published-only' }],
      topics: [createTopic({ relatedContentIds: ['draft-only'], producedContentSlug: undefined })],
      needCases: [createNeedCase({ topicCandidateId: 'topic-hit-rate', feedbackStatus: 'resolved' })],
    });

    expect(rows).toEqual([]);
  });

  it('links published content back to a topic through sourceTopicId', () => {
    const [row] = calculateContentHitRates({
      contents: [{
        id: 'published-by-frontmatter',
        title: '已发布',
        href: '/posts/published-by-frontmatter',
        sourceTopicId: 'topic-hit-rate',
      }],
      topics: [createTopic({ relatedContentIds: [], producedContentSlug: undefined })],
      needCases: [createNeedCase({ topicCandidateId: 'topic-hit-rate', feedbackStatus: 'resolved' })],
    });

    expect(row.contentId).toBe('published-by-frontmatter');
    expect(row.topicIds).toEqual(['topic-hit-rate']);
    expect(row.resolved).toBe(1);
    expect(row.rate).toBe(100);
  });
});
