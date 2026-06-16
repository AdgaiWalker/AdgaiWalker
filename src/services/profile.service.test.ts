/**
 * ProfileService — persona anchor validation + username-based profile CRUD
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

  it('rejects PII before any persistence', () => {
    expect(() => validatePersonaAnchor('13800138000')).toThrow(PersonaAnchorPiiError);
  });
});

function createFakeProfileStore(): UserProfileRepositoryPort {
  const profiles = new Map<string, UserProfile>();
  return {
    async save(profile) { profiles.set(profile.username, profile); },
    async findByUsername(username) { return profiles.get(username) ?? null; },
    async findAll() { return [...profiles.values()]; },
    async markDeleteRequested(username, requestedAt) {
      const existing = profiles.get(username);
      if (existing) profiles.set(username, { ...existing, deleteRequestedAt: requestedAt, updatedAt: requestedAt });
    },
  };
}

function createNeedCase(overrides: Partial<NeedCase>): NeedCase {
  const now = new Date().toISOString();
  return {
    needCaseId: overrides.needCaseId ?? crypto.randomUUID(),
    sessionId: overrides.sessionId ?? crypto.randomUUID(),
    username: overrides.username,
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

    const empty = await service.upsert('alice', {});
    expect(empty.confidence).toBe(0);
    expect(empty.personaAnchor).toBeUndefined();
    expect(empty.username).toBe('alice');
    expect(empty.profileId).toBe('alice');

    const anchored = await service.upsert('bob', { personaAnchor: '学生' });
    expect(anchored.confidence).toBe(1);
    expect(anchored.personaAnchor).toBe('学生');
  });

  it('redacts related NeedCases by username when deletion is requested', async () => {
    const username = `user-delete-${crypto.randomUUID().slice(0, 8)}`;
    const needCase = createNeedCase({ username });
    await saveNeedCase(needCase);

    const service = createUserProfileService({ profileStore: createFakeProfileStore() });
    await service.upsert(username, { personaAnchor: '学生' });
    await service.requestDeletion(username);

    const redacted = await getNeedCaseById(needCase.needCaseId);
    expect(redacted?.rawNeedRedacted).toBe('');
    expect(redacted?.profileSnapshot).toBeUndefined();
  });
});
