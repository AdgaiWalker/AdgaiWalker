/**
 * LearningRequest Store — 实现 LearningRequestRepositoryPort（P2-B）
 *
 * 薄壳委托给 conversation/store.ts 的学习请求存储（Redis + 内存降级）。
 */
import type {
  LearningRequest,
  LearningRequestRepositoryPort,
  LearningRequestStatus,
} from './ports';
import {
  findLearningRequestsByStatus,
  findRecentLearningRequests,
  getLearningRequestById,
  saveLearningRequest,
} from '@/conversation/store';

export function createLearningRequestStore(): LearningRequestRepositoryPort {
  return {
    async save(request: LearningRequest): Promise<void> {
      await saveLearningRequest(request);
    },
    async findById(requestId: string): Promise<LearningRequest | null> {
      return getLearningRequestById(requestId);
    },
    async findByStatus(status: LearningRequestStatus): Promise<LearningRequest[]> {
      return findLearningRequestsByStatus(status);
    },
    async findRecent(limit?: number): Promise<LearningRequest[]> {
      return findRecentLearningRequests(limit);
    },
  };
}
