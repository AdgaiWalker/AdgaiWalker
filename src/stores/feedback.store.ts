/**
 * 反馈 Store — 实现 FeedbackRepositoryPort
 *
 * 委托给 conversation/store.ts 的反馈存储（Redis + 内存降级）。
 */

import type { MatchFeedbackEvent, FeedbackRepositoryPort } from './ports';

import {
  getMatchFeedbackByNeedCase,
  getMatchFeedbackEvents as legacyFind,
  saveMatchFeedback as legacySave,
} from '@/conversation/store';

export function createFeedbackStore(): FeedbackRepositoryPort {
  return {
    async save(event: MatchFeedbackEvent): Promise<void> {
      await legacySave(event as Parameters<typeof legacySave>[0]);
    },

    async findRecent(days: number, limit = 500): Promise<MatchFeedbackEvent[]> {
      return legacyFind({ days, limit }) as Promise<MatchFeedbackEvent[]>;
    },

    async findByNeedCase(needCaseId: string): Promise<MatchFeedbackEvent[]> {
      return getMatchFeedbackByNeedCase(needCaseId);
    },
  };
}
