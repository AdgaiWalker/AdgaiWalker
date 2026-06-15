/**
 * ProfileService — persona anchor validation
 */

import { describe, expect, it } from 'vitest';

import { PersonaAnchorPiiError, validatePersonaAnchor } from '@/services/profile.service';
import { createUserProfileService } from '@/services/profile.service';
import { getNeedCaseById, saveNeedCase } from '@/conversation/store';
import type { NeedCase, UserProfile, UserProfileRepositoryPort } from '@/stores/ports';

describe('validatePersonaAnchor', () => {
  it('trims and caps anchors to 10 chars', () => {
    expect(validatePersonaAnchor('  自由职业者正在学习AI  ')).toBe('自由职业者正在学习A');
  });

  it('rejects PII before invite admission consumes quota', () => {
    expect(() => validatePersonaAnchor('13800138000')).toThrow(PersonaAnchorPiiError);
  });
});

function createFakeProfileStore(): UserProfileRepositoryPort {
  const profiles = new Map<string, UserProfile>();
  return {
    async save(profile) { profiles.set(profile.sessionId, profile); },
    async findBySessionId(sessionId) { return profiles.get(sessionId) ?? null; },
    async findAll() { return [...profiles.values()]; },
    async markDeleteRequested(sessionId, requestedAt) {
      const existing = profiles.get(sessionId);
      if (existing) profiles.set(sessionId, { ...existing, deleteRequestedAt: requestedAt, updatedAt: requestedAt });
    },
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
    recommendedContentIds: [],
    recommendedToolIds: [],
    profileSnapshot: {
      roleInContext: '学生',
      personaAnchor: '学生',
      goal: '学 AI',
      stuckPoint: '需求不清',
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

describe('UserProfileService', () => {
  it('computes confidence from personaAnchor only', async () => {
    const service = createUserProfileService({ profileStore: createFakeProfileStore() });

    const empty = await service.upsert('session-profile-confidence-empty', {});
    expect(empty.confidence).toBe(0);
    expect(empty.personaAnchor).toBeUndefined();

    const anchored = await service.upsert('session-profile-confidence-anchor', { personaAnchor: '学生' });
    expect(anchored.confidence).toBe(1);
    expect(anchored.personaAnchor).toBe('学生');
  });

  it('redacts related NeedCases when deletion is requested', async () => {
    const sessionId = `session-delete-${crypto.randomUUID()}`;
    const needCase = createNeedCase({ sessionId });
    await saveNeedCase(needCase);

    const service = createUserProfileService({ profileStore: createFakeProfileStore() });
    await service.upsert(sessionId, { personaAnchor: '学生' });
    await service.requestDeletion(sessionId);

    const redacted = await getNeedCaseById(needCase.needCaseId);
    expect(redacted?.rawNeedRedacted).toBe('');
    expect(redacted?.profileSnapshot).toBeUndefined();
  });
});
