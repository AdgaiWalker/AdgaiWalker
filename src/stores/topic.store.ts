/**
 * Topic Candidate Store
 *
 * 选题候选域的真实存储实现（Redis + 内存降级）。
 * 原先寄居于 conversation/store.ts，现迁入本域 Store，保持四层架构的数据边界。
 *
 * 键约定：
 *   match:topic:{topicId}   单实体
 *   match:topics            全量索引列表（LPUSH topicId）
 */
import { getRedis } from '@/stores/redis-client';

import type { TopicCandidate, TopicCandidateRepositoryPort, TopicCandidateStatus } from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储
// ---------------------------------------------------------------------------

const memoryTopicCandidates = new Map<string, TopicCandidate>();

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

function topicKey(topicId: string): string {
  return `match:topic:${topicId}`;
}

// ---------------------------------------------------------------------------
// Topic Candidate CRUD
// ---------------------------------------------------------------------------

/** 获取所有 TopicCandidate（按 priority 排序） */
export async function getTopicCandidates(options?: {
  status?: TopicCandidate['status'];
  limit?: number;
}): Promise<TopicCandidate[]> {
  const limit = options?.limit ?? 50;
  const redis = getRedis();

  let candidates: TopicCandidate[];

  if (redis) {
    const ids = await redis.lrange<string>('match:topics', 0, Math.max(0, limit - 1));
    const items = await Promise.all(ids.map(id => redis!.get<TopicCandidate>(topicKey(id))));
    candidates = items.filter((c): c is TopicCandidate => c !== null);
  } else {
    candidates = [...memoryTopicCandidates.values()];
  }

  if (options?.status) {
    candidates = candidates.filter(c => c.status === options.status);
  }

  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  candidates.sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));

  return candidates.slice(0, limit);
}

export async function getTopicCandidateById(topicId: string): Promise<TopicCandidate | null> {
  const redis = getRedis();
  const memory = memoryTopicCandidates.get(topicId) ?? null;
  if (!redis) return memory;
  return (await redis.get<TopicCandidate>(topicKey(topicId))) ?? memory;
}

export async function getTopicCandidateByClusterKey(clusterKey: string): Promise<TopicCandidate | null> {
  const candidates = await getTopicCandidates({ limit: 1000 });
  return candidates.find(candidate => candidate.clusterKey === clusterKey) ?? null;
}

export async function updateTopicCandidateStatus(
  topicId: string,
  status: TopicCandidate['status'],
  options?: { producedContentSlug?: string },
): Promise<TopicCandidate | null> {
  const current = await getTopicCandidateById(topicId);
  if (!current) return null;

  const updated: TopicCandidate = {
    ...current,
    status,
    ...(options?.producedContentSlug ? { producedContentSlug: options.producedContentSlug } : {}),
    updatedAt: new Date().toISOString(),
  };

  memoryTopicCandidates.set(topicId, updated);

  const redis = getRedis();
  if (redis) {
    await redis.set(topicKey(topicId), updated);
  }

  return updated;
}

export async function saveTopicCandidates(candidates: TopicCandidate[]): Promise<void> {
  const redis = getRedis();
  for (const candidate of candidates) {
    const existedInMemory = memoryTopicCandidates.has(candidate.topicId);
    memoryTopicCandidates.set(candidate.topicId, candidate);
    if (redis) {
      const existedInRedis = Boolean(await redis.get<TopicCandidate>(topicKey(candidate.topicId)));
      await redis.set(topicKey(candidate.topicId), candidate);
      if (!existedInMemory && !existedInRedis) {
        await redis.lpush('match:topics', candidate.topicId);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// TopicCandidateRepositoryPort 工厂
// ---------------------------------------------------------------------------

export function createTopicStore(): TopicCandidateRepositoryPort {
  return {
    async findAll(options?: { status?: TopicCandidateStatus; limit?: number }): Promise<TopicCandidate[]> {
      return getTopicCandidates(options);
    },

    async findById(topicId: string): Promise<TopicCandidate | null> {
      return getTopicCandidateById(topicId);
    },

    async findByClusterKey(clusterKey: string): Promise<TopicCandidate | null> {
      return getTopicCandidateByClusterKey(clusterKey);
    },

    async updateStatus(
      topicId: string,
      status: TopicCandidateStatus,
      options?: { producedContentSlug?: string },
    ): Promise<TopicCandidate | null> {
      return updateTopicCandidateStatus(topicId, status, options);
    },

    async saveAll(candidates: TopicCandidate[]): Promise<void> {
      await saveTopicCandidates(candidates);
    },
  };
}
