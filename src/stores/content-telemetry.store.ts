/**
 * ContentTelemetry Store — 实现 ContentTelemetryRepositoryPort（P3-A）
 *
 * 薄壳委托给 conversation/store.ts 的 ContentTelemetry 存储（Redis + 内存降级）。
 * 与 ContentFeedback 完全分开存储、分开计算（hai-razor 保留复杂度）。
 */

import type { ContentTelemetryEvent, ContentTelemetryRepositoryPort } from './ports';

import {
  findContentTelemetryByContent,
  findRecentContentTelemetry,
  saveContentTelemetry,
} from '@/conversation/store';

export function createContentTelemetryStore(): ContentTelemetryRepositoryPort {
  return {
    async save(event: ContentTelemetryEvent): Promise<void> {
      await saveContentTelemetry(event);
    },

    async findByContent(contentId, range): Promise<ContentTelemetryEvent[]> {
      return findContentTelemetryByContent(contentId, range);
    },

    async findRecent(range, limit = 2000): Promise<ContentTelemetryEvent[]> {
      return findRecentContentTelemetry(range, limit);
    },
  };
}
