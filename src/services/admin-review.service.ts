/**
 * 后台复盘服务 — Need Case 列表 + review 状态管理
 *
 * 只负责读取和标记，不承载选题生成、内容创作等复杂逻辑（第一轮范围外）。
 */

import type { AdminReviewServicePort, NeedCaseReviewItem } from './interfaces';
import type {
  AdminReviewStatus,
  FeedbackRepositoryPort,
  NeedCaseRepositoryPort,
} from '@/stores/ports';

export function createAdminReviewService(deps: {
  needCaseStore: NeedCaseRepositoryPort;
  feedbackStore: FeedbackRepositoryPort;
}): AdminReviewServicePort {
  async function decorate(cases: Array<Awaited<ReturnType<typeof deps.needCaseStore.findPendingReview>>[number]>): Promise<NeedCaseReviewItem[]> {
    return Promise.all(
      cases.map(async needCase => {
        const feedbacks = await deps.feedbackStore.findByNeedCase(needCase.needCaseId);
        return { needCase, feedbacks };
      }),
    );
  }

  return {
    async listPending(options?: { limit?: number }): Promise<NeedCaseReviewItem[]> {
      const cases = await deps.needCaseStore.findPendingReview(options);
      return decorate(cases);
    },

    async listAll(options?: { limit?: number }): Promise<NeedCaseReviewItem[]> {
      const limit = options?.limit ?? 100;
      const cases = await deps.needCaseStore.findRecent(90);
      return decorate(cases.slice(0, limit));
    },

    async updateReview(
      needCaseId: string,
      status: AdminReviewStatus,
      note?: string,
    ): Promise<boolean> {
      try {
        await deps.needCaseStore.updateAdminReview(needCaseId, status, note);
        return true;
      } catch {
        return false;
      }
    },
  };
}
