/**
 * 反馈 Store — 实现 FeedbackRepositoryPort
 */

import type { MatchFeedbackEvent, FeedbackRepositoryPort } from './ports';

import {
  saveMatchFeedback as legacySave,
  getMatchFeedbackEvents as legacyFind,
} from '@/conversation/store';

export function createFeedbackStore(): FeedbackRepositoryPort {
  return {
    async save(event: MatchFeedbackEvent): Promise<void> {
      await legacySave(event as Parameters<typeof legacySave>[0]);
    },

    async findRecent(days: number, limit = 500): Promise<MatchFeedbackEvent[]> {
      return legacyFind({ days, limit }) as Promise<MatchFeedbackEvent[]>;
    },
  };
}
