/**
 * WorkItem Store — 实现 WorkItemRepositoryPort（P0-B / hai-razor 包 B）
 *
 * WorkItem 域的真实存储实现（Redis + 内存降级）。
 * 原先寄居于 conversation/store.ts，现迁入本域 Store，保持四层架构的数据边界。
 * 生产缺 Redis 时是否拒绝写入由 service 层依据 storage-mode 决定。
 */
import { getRedis } from '@/stores/redis-client';

import type {
  WorkItem,
  WorkItemRepositoryPort,
  WorkItemStatus,
} from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储
// ---------------------------------------------------------------------------

const memoryWorkItems = new Map<string, WorkItem>();

// ---------------------------------------------------------------------------
// Redis key 约定
//   admin:workitem:{id}        单实体
//   admin:workitems            全量索引列表（LPUSH id）
//   admin:workitems:active     活跃索引列表（非终态）
//   admin:workitems:by-state:{status}   按状态索引列表（LPUSH id），便于按队列过滤
// 内存降级：开发期 memory-development；生产缺 Redis 时写操作由 service 层拒绝（503）。
// ---------------------------------------------------------------------------

function workItemKey(workItemId: string): string {
  return `admin:workitem:${workItemId}`;
}

const WORKITEMS_LIST = 'admin:workitems';
const WORKITEMS_ACTIVE_LIST = 'admin:workitems:active';
const TERMINAL_STATUSES: WorkItemStatus[] = ['resolved', 'rejected'];

/**
 * 生产等价存储验证（scripts/verify-production-storage.mjs）需要与这里使用完全一致的键名，
 * 否则会写到 app 永远不读的命名空间而"假通过"。这里导出键名真相源，供对账测试锁定一致性。
 */
export const WORKITEM_REDIS_KEYS = {
  workItem: workItemKey,
  list: WORKITEMS_LIST,
  activeList: WORKITEMS_ACTIVE_LIST,
} as const;

function workItemStateIndexKey(status: WorkItemStatus): string {
  return `admin:workitems:by-state:${status}`;
}

/** 仅开发期测试用：清空内存 WorkItem，不触碰 Redis。 */
export function __resetMemoryWorkItems(): void {
  memoryWorkItems.clear();
}

/** 仅开发演示场景用：清理指定前缀的内存 WorkItem，不触碰真实 Redis。 */
export function __deleteMemoryWorkItemsByPrefix(prefix: string): number {
  let deleted = 0;
  for (const id of [...memoryWorkItems.keys()]) {
    if (id.startsWith(prefix)) {
      memoryWorkItems.delete(id);
      deleted += 1;
    }
  }
  return deleted;
}

/** 仅开发演示场景用：清理标题带指定前缀的内存 WorkItem，不触碰真实 Redis。 */
export function __deleteMemoryWorkItemsByTitlePrefix(prefix: string): number {
  let deleted = 0;
  for (const [id, item] of [...memoryWorkItems.entries()]) {
    if (item.title.startsWith(prefix)) {
      memoryWorkItems.delete(id);
      deleted += 1;
    }
  }
  return deleted;
}

export async function saveWorkItem(workItem: WorkItem): Promise<void> {
  memoryWorkItems.set(workItem.workItemId, workItem);
  const redis = getRedis();
  if (!redis) return;

  // previous 必须在事务外读取（Upstash MULTI 不支持事务内读用于分支判断）。
  const previous = await redis.get<WorkItem>(workItemKey(workItem.workItemId));

  // P0-B02：实体写入与所有索引维护放进单个 MULTI/EXEC 原子事务。
  // 此前是顺序 await 单命令，set 写完后若 lpush 前进程崩溃或某条 HTTP 失败，
  // 会留下"实体已更新但索引未更新"的不一致——listWorkItems 读到旧状态索引。
  // MULTI 保证写阶段原子：要么全部生效，要么全部不生效。
  // 事务内仍保留"先 lrem 再 lpush"的幂等命令顺序作为 defense-in-depth，
  // 即便将来误用非原子 pipeline 也不会产生脏索引。
  const tx = redis.multi();
  tx.set(workItemKey(workItem.workItemId), workItem);
  if (!previous) {
    tx.lpush(WORKITEMS_LIST, workItem.workItemId);
  }
  // 维护"活跃"列表：终态移出，非终态移入
  if (TERMINAL_STATUSES.includes(workItem.status)) {
    tx.lrem(WORKITEMS_ACTIVE_LIST, 0, workItem.workItemId);
  } else if (!previous) {
    tx.lpush(WORKITEMS_ACTIVE_LIST, workItem.workItemId);
  }
  // 状态索引：状态迁移时必须从旧状态索引移除，否则已迁移 WorkItem 残留在旧索引，
  // listWorkItems({status}) 单状态过滤在脏条目超过 limit 时会读到全脏 id、被 re-filter 清空，
  // 返回错误空列表。此处先按 from→to 清旧，再写新（去重 + 保证在列）。
  if (previous && previous.status !== workItem.status) {
    tx.lrem(workItemStateIndexKey(previous.status), 0, workItem.workItemId);
  }
  tx.lrem(workItemStateIndexKey(workItem.status), 0, workItem.workItemId);
  tx.lpush(workItemStateIndexKey(workItem.status), workItem.workItemId);
  await tx.exec();
}

export async function getWorkItemById(workItemId: string): Promise<WorkItem | null> {
  const redis = getRedis();
  const fromMemory = memoryWorkItems.get(workItemId) ?? null;
  if (!redis) return fromMemory;
  return (await redis.get<WorkItem>(workItemKey(workItemId))) ?? fromMemory;
}

export async function listWorkItems(options?: {
  queue?: WorkItem['queue'];
  status?: WorkItemStatus | WorkItemStatus[];
  limit?: number;
}): Promise<WorkItem[]> {
  const limit = options?.limit ?? 50;
  const redis = getRedis();

  let ids: string[];
  if (redis) {
    // 有状态过滤时优先用状态索引，减少全量扫描
    const statusFilter = options?.status
      ? (Array.isArray(options.status) ? options.status : [options.status])
      : null;
    ids = statusFilter && statusFilter.length === 1
      ? await redis.lrange<string>(workItemStateIndexKey(statusFilter[0]), 0, Math.max(0, limit - 1))
      : await redis.lrange<string>(WORKITEMS_LIST, 0, Math.max(0, limit - 1));
  } else {
    ids = [...memoryWorkItems.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map(item => item.workItemId);
  }

  const items = redis
    ? (await Promise.all(ids.map(id => redis!.get<WorkItem>(workItemKey(id)))))
        .filter((item): item is WorkItem => item !== null)
    : ids.map(id => memoryWorkItems.get(id)).filter((item): item is WorkItem => item !== null);

  const statusSet = options?.status
    ? new Set(Array.isArray(options.status) ? options.status : [options.status])
    : null;
  const filtered = items.filter(item => {
    if (options?.queue && item.queue !== options.queue) return false;
    if (statusSet && !statusSet.has(item.status)) return false;
    return true;
  });

  return filtered
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export async function listActiveWorkItems(options?: { limit?: number }): Promise<WorkItem[]> {
  const limit = options?.limit ?? 50;
  const redis = getRedis();

  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(WORKITEMS_ACTIVE_LIST, 0, Math.max(0, limit - 1));
  } else {
    ids = [...memoryWorkItems.values()]
      .filter(item => !TERMINAL_STATUSES.includes(item.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map(item => item.workItemId);
  }

  const items = redis
    ? (await Promise.all(ids.map(id => redis!.get<WorkItem>(workItemKey(id)))))
        .filter((item): item is WorkItem => item !== null)
    : ids.map(id => memoryWorkItems.get(id)).filter((item): item is WorkItem => item !== null);

  return items
    .filter(item => !TERMINAL_STATUSES.includes(item.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export async function deleteWorkItem(workItemId: string): Promise<void> {
  const existing = memoryWorkItems.get(workItemId);
  if (existing) {
    memoryWorkItems.delete(workItemId);
  }
  const redis = getRedis();
  if (!redis) return;
  await redis.del(workItemKey(workItemId));
  await redis.lrem(WORKITEMS_LIST, 0, workItemId);
  await redis.lrem(WORKITEMS_ACTIVE_LIST, 0, workItemId);
  // 状态索引无法精确知道旧状态，遍历可能的状态清理
  for (const status of [
    'proposal', 'pending', 'accepted', 'rejected', 'paused',
    'acting', 'awaiting-verification', 'resolved',
  ] as WorkItemStatus[]) {
    await redis.lrem(workItemStateIndexKey(status), 0, workItemId);
  }
}

// ---------------------------------------------------------------------------
// Port 适配器：把上面的存储函数适配成 WorkItemRepositoryPort
// ---------------------------------------------------------------------------

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
