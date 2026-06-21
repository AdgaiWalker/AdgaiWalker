/**
 * WorkItem Store — 实现 WorkItemRepositoryPort（P0-B / hai-razor 包 B）
 *
 * 薄壳委托给 conversation/store.ts 的 WorkItem 存储（Redis + 内存降级）。
 * 生产缺 Redis 时是否拒绝写入由 service 层依据 storage-mode 决定。
 */

import type {
  WorkItem,
  WorkItemRepositoryPort,
} from './ports';

import {
  deleteWorkItem,
  getWorkItemById,
  listActiveWorkItems,
  listWorkItems,
  saveWorkItem,
} from '@/conversation/store';

export function createWorkItemStore(): WorkItemRepositoryPort {
  return {
    async save(workItem: WorkItem): Promise<void> {
      await saveWorkItem(workItem);
    },

    async findById(workItemId: string): Promise<WorkItem | null> {
      return getWorkItemById(workItemId);
    },

    async list(options): Promise<WorkItem[]> {
      return listWorkItems(options);
    },

    async listActive(options?: { limit?: number }): Promise<WorkItem[]> {
      return listActiveWorkItems(options);
    },

    async delete(workItemId: string): Promise<void> {
      await deleteWorkItem(workItemId);
    },
  };
}
