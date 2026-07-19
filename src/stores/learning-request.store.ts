/**
 * LearningRequest Store — 实现 LearningRequestRepositoryPort（P2-B）
 *
 * 证据不足补证任务存储的真正实现（Redis + 内存降级）。
 * 存储逻辑从 conversation/store.ts 迁移至此，成为 LearningRequest 域的权威存储入口。
 *
 * Key 约定：
 *   learning-request:{id}            单条
 *   learning-request:by-status:{status}  按状态索引
 *   learning-request:recent          最近索引
 */
import { getRedis } from '@/stores/redis-client';

import type {
  LearningRequest,
  LearningRequestRepositoryPort,
  LearningRequestStatus,
} from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储（Redis 不可用时兜底）
// ---------------------------------------------------------------------------

const memoryLearningRequests = new Map<string, LearningRequest>();

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

function learningRequestKey(requestId: string): string {
  return `learning-request:${requestId}`;
}
function learningRequestByStatusKey(status: LearningRequestStatus): string {
  return `learning-request:by-status:${status}`;
}
const LEARNING_REQUEST_RECENT = 'learning-request:recent';

/** 仅测试用：清空内存 LearningRequest */
export function __resetMemoryLearningRequests(): void {
  memoryLearningRequests.clear();
}

export async function saveLearningRequest(request: LearningRequest): Promise<void> {
  memoryLearningRequests.set(request.requestId, request);
  const redis = getRedis();
  if (!redis) return;

  // previous 在事务外读取（Upstash MULTI 不支持事务内读用于分支判断）。
  const previous = await redis.get<LearningRequest>(learningRequestKey(request.requestId));

  // P0-B02：实体 + 索引写入放进单个 MULTI/EXEC 原子事务（与 saveWorkItem 同策略）。
  // 同时修复此前的确定性脏索引 bug：状态迁移时未从旧 by-status 索引移除，
  // 与第十四轮前的 saveWorkItem 同形——findLearningRequestsByStatus 单状态过滤
  // 在脏条目超过 lrange 上限时会读到全脏 id、被 re-filter 清空，返回错误空列表。
  const tx = redis.multi();
  tx.set(learningRequestKey(request.requestId), request);
  if (previous && previous.status !== request.status) {
    tx.lrem(learningRequestByStatusKey(previous.status), 0, request.requestId);
  }
  tx.lrem(learningRequestByStatusKey(request.status), 0, request.requestId);
  tx.lpush(learningRequestByStatusKey(request.status), request.requestId);
  tx.lpush(LEARNING_REQUEST_RECENT, request.requestId);
  tx.ltrim(LEARNING_REQUEST_RECENT, 0, 499);
  await tx.exec();
}

export async function getLearningRequestById(requestId: string): Promise<LearningRequest | null> {
  const redis = getRedis();
  const fromMemory = memoryLearningRequests.get(requestId) ?? null;
  if (!redis) return fromMemory;
  return (await redis.get<LearningRequest>(learningRequestKey(requestId))) ?? fromMemory;
}

export async function findLearningRequestsByStatus(status: LearningRequestStatus): Promise<LearningRequest[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(learningRequestByStatusKey(status), 0, 199);
  } else {
    ids = [...memoryLearningRequests.values()].filter(r => r.status === status).map(r => r.requestId);
  }
  const items = redis
    ? (await Promise.all(ids.map(id => redis!.get<LearningRequest>(learningRequestKey(id)))))
        .filter((r): r is LearningRequest => r !== null)
    : ids.map(id => memoryLearningRequests.get(id)).filter((r): r is LearningRequest => Boolean(r));
  return items.filter(r => r.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findRecentLearningRequests(limit = 100): Promise<LearningRequest[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(LEARNING_REQUEST_RECENT, 0, Math.max(0, limit - 1));
  } else {
    ids = [...memoryLearningRequests.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(r => r.requestId);
  }
  const items = redis
    ? (await Promise.all(ids.map(id => redis!.get<LearningRequest>(learningRequestKey(id)))))
        .filter((r): r is LearningRequest => r !== null)
    : ids.map(id => memoryLearningRequests.get(id)).filter((r): r is LearningRequest => Boolean(r));
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// Port 工厂 —— 上层依赖 LearningRequestRepositoryPort 接口，不依赖具体函数
// ---------------------------------------------------------------------------

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
