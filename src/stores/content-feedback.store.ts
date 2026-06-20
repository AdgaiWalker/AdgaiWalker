/**
 * ContentFeedback Store — 实现 ContentFeedbackRepositoryPort（P1-A）
 *
 * 薄壳委托给 conversation/store.ts 的 ContentFeedback 存储（Redis + 内存降级）。
 * 与 MatchFeedback 完全分开存储、分开计算（hai-razor 保留复杂度）。
 */

import type { ContentFeedbackEvent, ContentFeedbackRepositoryPort } from './ports';

import {
  findContentFeedbackByContent,
  findContentFeedbackByTopic,
  findRecentContentFeedback,
  saveContentFeedback,
} from '@/conversation/store';

export function createContentFeedbackStore(): ContentFeedbackRepositoryPort {
  return {
    async save(event: ContentFeedbackEvent): Promise<void> {
      await saveContentFeedback(event);
    },

    async findByContent(contentId, range): Promise<ContentFeedbackEvent[]> {
      return findContentFeedbackByContent(contentId, range);
    },

    async findByTopic(topicId, range): Promise<ContentFeedbackEvent[]> {
      return findContentFeedbackByTopic(topicId, range);
    },

    async findRecent(range, limit = 500): Promise<ContentFeedbackEvent[]> {
      return findRecentContentFeedback(range, limit);
    },
  };
}
