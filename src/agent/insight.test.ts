import { describe, expect, it } from 'vitest';

import { createCandidate, processPendingNeedCases } from '@/agent/insight';
import { getNeedCaseById, saveNeedCase } from '@/conversation/store';
import type { NeedCase } from '@/stores/ports';

function createNeedCase(overrides: Partial<NeedCase>): NeedCase {
  const now = new Date().toISOString();
  return {
    needCaseId: overrides.needCaseId ?? crypto.randomUUID(),
    sessionId: overrides.sessionId ?? crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    sourcePage: '/tools',
    rawNeedRedacted: '我想用 AI 做一个学习计划',
    needSummary: '我想用 AI 做一个学习计划',
    needCategories: ['learn-ai'],
    frictionLayer: 'scenario-match',
    recommendedAbilityType: 'learning-path',
    recommendedContentIds: ['walkcraft-skill-craft'],
    recommendedToolIds: [],
    profileSnapshot: {
      roleInContext: '学生',
      personaAnchor: '学生',
      goal: '学习 AI',
      stuckPoint: '场景匹配',
      socialContext: '学生',
      sliceInferred: true,
      capturedAt: now,
    },
    sliceInferred: true,
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

describe('Topic insight clustering', () => {
  it('creates PRD-shaped TopicCandidate from NeedCases', () => {
    const cases = [
      createNeedCase({ needCaseId: 'case-candidate-1' }),
      createNeedCase({ needCaseId: 'case-candidate-2' }),
    ];

    const candidate = createCandidate(cases, 'scenario-match:learning-path:learn-ai:学生');

    expect(candidate.status).toBe('observed');
    expect(candidate.source).toBe('need-cluster');
    expect(candidate.density).toBe(2);
    expect(candidate.roleDistribution).toEqual([{ role: '学生', count: 2 }]);
    expect(candidate.representativeNeed).toContain('学习计划');
    expect(candidate.relatedContentIds).toContain('walkcraft-skill-craft');
  });

  it('marks clustered NeedCases with topicCandidateId', async () => {
    const createdAt = '2999-01-01T00:00:00.000Z';
    const first = createNeedCase({
      needCaseId: `case-process-${crypto.randomUUID()}`,
      createdAt,
      updatedAt: createdAt,
    });
    const second = createNeedCase({
      needCaseId: `case-process-${crypto.randomUUID()}`,
      createdAt,
      updatedAt: createdAt,
    });

    await saveNeedCase(first);
    await saveNeedCase(second);

    const result = await processPendingNeedCases(2);

    expect(result.processed).toBe(2);
    expect(result.candidates[0]?.topicId).toBeTruthy();

    const reloadedFirst = await getNeedCaseById(first.needCaseId);
    const reloadedSecond = await getNeedCaseById(second.needCaseId);
    expect(reloadedFirst?.topicCandidateId).toBe(result.candidates[0].topicId);
    expect(reloadedSecond?.topicCandidateId).toBe(result.candidates[0].topicId);
    expect(reloadedFirst?.topicProcessedAt).toBeTruthy();
  });
});
