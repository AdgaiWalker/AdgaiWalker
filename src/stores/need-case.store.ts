/**
 * Need Case Store — 实现 NeedCaseRepositoryPort
 *
 * Need Case 域的真实存储实现（Redis + 内存降级）。
 * 原先寄居于 conversation/store.ts，现迁入本域 Store，保持四层架构的数据边界。
 */
import { getRedis } from '@/stores/redis-client';

import type {
  AdminReviewStatus,
  FeedbackStatus,
  NeedCase,
  NeedCaseRepositoryPort,
} from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储
// ---------------------------------------------------------------------------

const memoryNeedCases = new Map<string, NeedCase>();

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

function needCaseKey(needCaseId: string): string {
  return `match:needcase:${needCaseId}`;
}

const NEEDCASE_REVIEW_PENDING_LIST = 'match:needcase:review:pending';
const NEEDCASE_TOPICS_UNPROCESSED_LIST = 'match:needcase:topics:unprocessed';
const NEEDCASE_RECENT_LIST = 'match:needcase:recent';

// ---------------------------------------------------------------------------
// Need Case
// ---------------------------------------------------------------------------

export async function saveNeedCase(needCase: NeedCase): Promise<void> {
  const redis = getRedis();
  memoryNeedCases.set(needCase.needCaseId, needCase);
  if (!redis) return;

  await redis.set(needCaseKey(needCase.needCaseId), needCase);
  if (needCase.adminReviewStatus === 'pending') {
    await redis.lpush(NEEDCASE_REVIEW_PENDING_LIST, needCase.needCaseId);
  }
  if (!needCase.topicProcessedAt) {
    await redis.lpush(NEEDCASE_TOPICS_UNPROCESSED_LIST, needCase.needCaseId);
  }
  await redis.lpush(NEEDCASE_RECENT_LIST, needCase.needCaseId);
  // 最近列表只保留 500 条索引，避免无限增长
  await redis.ltrim(NEEDCASE_RECENT_LIST, 0, 499);
}

export async function getNeedCaseById(needCaseId: string): Promise<NeedCase | null> {
  const redis = getRedis();
  if (!redis) return memoryNeedCases.get(needCaseId) ?? null;
  return (await redis.get<NeedCase>(needCaseKey(needCaseId))) ?? memoryNeedCases.get(needCaseId) ?? null;
}

export async function getNeedCasesBySession(sessionId: string): Promise<NeedCase[]> {
  const redis = getRedis();
  const fromMemory = [...memoryNeedCases.values()].filter(c => c.sessionId === sessionId);
  if (!redis) return fromMemory;

  // Redis 没有按 session 索引；扫最近列表匹配。开发期数据量小，可接受。
  const recent = await getRecentNeedCases(500);
  const bySession = recent.filter(c => c.sessionId === sessionId);
  return bySession.length > 0 ? bySession : fromMemory;
}

/** 列出某用户的 NeedCase（admin 详情页用，扫最近 2000 条过滤 username） */
export async function getNeedCasesByUsername(username: string): Promise<NeedCase[]> {
  const all = await getRecentNeedCases(2000);
  return all.filter((c) => c.username === username);
}

/** 账号级联删除：按 username 脱敏关联的所有 NeedCase（清空原始需求 + 切片，保留聚合匿名） */
export async function redactNeedCasesByUsername(username: string): Promise<void> {
  const cases = await getRecentNeedCases(2000);
  const now = new Date().toISOString();
  for (const c of cases) {
    if (c.username !== username) continue;
    await saveNeedCase({
      ...c,
      rawNeedRedacted: '',
      profileSnapshot: undefined,
      updatedAt: now,
    });
  }
}

export async function getPendingReviewNeedCases(options?: { limit?: number }): Promise<NeedCase[]> {
  const limit = options?.limit ?? 50;
  const redis = getRedis();

  if (!redis) {
    return [...memoryNeedCases.values()]
      .filter(c => c.adminReviewStatus === 'pending')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  const ids = await redis.lrange<string>(NEEDCASE_REVIEW_PENDING_LIST, 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis.get<NeedCase>(needCaseKey(id))));
  return items.filter((c): c is NeedCase => c !== null && c.adminReviewStatus === 'pending');
}

export async function getUnprocessedNeedCases(limit = 50): Promise<NeedCase[]> {
  const redis = getRedis();

  if (!redis) {
    return [...memoryNeedCases.values()]
      .filter(c => !c.topicProcessedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  const ids = await redis.lrange<string>(NEEDCASE_TOPICS_UNPROCESSED_LIST, 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis.get<NeedCase>(needCaseKey(id))));
  return items.filter((c): c is NeedCase => c !== null && !c.topicProcessedAt);
}

export async function getRecentNeedCases(limit = 500): Promise<NeedCase[]> {
  const redis = getRedis();

  if (!redis) {
    return [...memoryNeedCases.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  const ids = await redis.lrange<string>(NEEDCASE_RECENT_LIST, 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis.get<NeedCase>(needCaseKey(id))));
  return items.filter((c): c is NeedCase => c !== null);
}

export async function updateNeedCaseFeedback(needCaseId: string, feedbackStatus: NeedCase['feedbackStatus']): Promise<void> {
  const redis = getRedis();
  const memory = memoryNeedCases.get(needCaseId);
  if (memory) memoryNeedCases.set(needCaseId, { ...memory, feedbackStatus, updatedAt: new Date().toISOString() });

  if (!redis) return;
  const current = await redis.get<NeedCase>(needCaseKey(needCaseId));
  if (!current) return;
  await redis.set(needCaseKey(needCaseId), { ...current, feedbackStatus, updatedAt: new Date().toISOString() });
}

export async function updateNeedCaseAdminReview(
  needCaseId: string,
  status: NeedCase['adminReviewStatus'],
  note?: string,
): Promise<void> {
  const redis = getRedis();
  const now = new Date().toISOString();
  const memory = memoryNeedCases.get(needCaseId);
  if (memory) {
    memoryNeedCases.set(needCaseId, {
      ...memory,
      adminReviewStatus: status,
      adminReviewNote: note ?? memory.adminReviewNote,
      updatedAt: now,
    });
  }

  if (!redis) return;
  const current = await redis.get<NeedCase>(needCaseKey(needCaseId));
  if (!current) return;
  await redis.set(needCaseKey(needCaseId), {
    ...current,
    adminReviewStatus: status,
    adminReviewNote: note ?? current.adminReviewNote,
    updatedAt: now,
  });
  // 离开 pending 后从待复盘列表移除
  if (status !== 'pending') {
    await redis.lrem(NEEDCASE_REVIEW_PENDING_LIST, 0, needCaseId);
  }
}

async function attachTopicCandidateToNeedCase(needCaseId: string, topicCandidateId: string): Promise<void> {
  const redis = getRedis();
  const memory = memoryNeedCases.get(needCaseId);
  if (memory) {
    memoryNeedCases.set(needCaseId, { ...memory, topicCandidateId, updatedAt: new Date().toISOString() });
  }
  if (!redis) return;
  const current = await redis.get<NeedCase>(needCaseKey(needCaseId));
  if (!current) return;
  await redis.set(needCaseKey(needCaseId), { ...current, topicCandidateId, updatedAt: new Date().toISOString() });
}

export async function markNeedCasesTopicProcessed(needCaseIds: string[], topicCandidateId?: string): Promise<void> {
  const redis = getRedis();
  const now = new Date().toISOString();
  for (const id of needCaseIds) {
    const memory = memoryNeedCases.get(id);
    if (memory) {
      memoryNeedCases.set(id, { ...memory, topicProcessedAt: now, topicCandidateId: topicCandidateId ?? memory.topicCandidateId });
    }
    if (redis) {
      const current = await redis.get<NeedCase>(needCaseKey(id));
      if (current) {
        await redis.set(needCaseKey(id), { ...current, topicProcessedAt: now, topicCandidateId: topicCandidateId ?? current.topicCandidateId });
      }
      await redis.lrem(NEEDCASE_TOPICS_UNPROCESSED_LIST, 0, id);
    }
  }
}

// ---------------------------------------------------------------------------
// Port 适配器：把上面的存储函数适配成 NeedCaseRepositoryPort
// ---------------------------------------------------------------------------

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
