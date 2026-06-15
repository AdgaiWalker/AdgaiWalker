/**
 * Need Case Store — 实现 NeedCaseRepositoryPort
 *
 * 委托给 conversation/store.ts 的 Need Case 存储实现（Redis + 内存降级）。
 */

import type {
  AdminReviewStatus,
  FeedbackStatus,
  NeedCase,
  NeedCaseRepositoryPort,
} from './ports';

import {
  attachTopicCandidateToNeedCase,
  getNeedCaseById,
  getNeedCasesBySession,
  getPendingReviewNeedCases,
  getRecentNeedCases,
  getUnprocessedNeedCases,
  markNeedCasesTopicProcessed,
  saveNeedCase,
  updateNeedCaseAdminReview,
  updateNeedCaseFeedback,
} from '@/conversation/store';

export function createNeedCaseStore(): NeedCaseRepositoryPort {
  return {
    async save(needCase: NeedCase): Promise<void> {
      await saveNeedCase(needCase);
    },

    async findById(needCaseId: string): Promise<NeedCase | null> {
      return getNeedCaseById(needCaseId);
    },

    async findBySessionId(sessionId: string): Promise<NeedCase[]> {
      return getNeedCasesBySession(sessionId);
    },

    async findPendingReview(options?: { limit?: number }): Promise<NeedCase[]> {
      return getPendingReviewNeedCases(options);
    },

    async findUnprocessedForTopics(limit = 50): Promise<NeedCase[]> {
      return getUnprocessedNeedCases(limit);
    },

    async findRecent(days: number): Promise<NeedCase[]> {
      const recent = await getRecentNeedCases(2000);
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      return recent.filter(c => c.createdAt >= cutoff);
    },

    async updateFeedback(needCaseId: string, feedbackStatus: FeedbackStatus): Promise<void> {
      await updateNeedCaseFeedback(needCaseId, feedbackStatus);
    },

    async updateAdminReview(
      needCaseId: string,
      status: AdminReviewStatus,
      note?: string,
    ): Promise<void> {
      await updateNeedCaseAdminReview(needCaseId, status, note);
    },

    async markTopicProcessed(needCaseIds: string[], topicCandidateId?: string): Promise<void> {
      await markNeedCasesTopicProcessed(needCaseIds, topicCandidateId);
    },
  };
}

export { attachTopicCandidateToNeedCase };
