/**
 * 反馈 Store — 实现 FeedbackRepositoryPort
 *
 * 反馈域存储的真正实现（Redis + 内存降级）。
 * 反馈存储逻辑从 conversation/store.ts 迁移至此，成为反馈域的权威存储入口。
 *
 * 键约定：
 *   match:feedback:{feedbackId}                    单事件（按 feedbackId）
 *   match:feedback                                 最近事件 ID 列表（LPUSH，倒序）
 *   match:feedback-by-needcase:{needCaseId}        按 needCaseId 索引的事件 ID 列表
 */
import { getRedis } from '@/stores/redis-client';
import { createMemoryStore } from '@/stores/memory-fallback';

import type { MatchFeedbackEvent, FeedbackRepositoryPort } from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储（Redis 不可用时兜底）
// ---------------------------------------------------------------------------

const memoryFeedbackEvents = createMemoryStore<MatchFeedbackEvent>();

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

function feedbackKey(feedbackId: string): string {
  return `match:feedback:${feedbackId}`;
}

// ---------------------------------------------------------------------------
// 反馈事件 CRUD
// ---------------------------------------------------------------------------

export async function saveMatchFeedback(event: MatchFeedbackEvent): Promise<void> {
  const redis = getRedis();
  memoryFeedbackEvents.set(event.feedbackId, event);
  if (!redis) return;

  await redis.set(feedbackKey(event.feedbackId), event);
  await redis.lpush('match:feedback', event.feedbackId);
  if (event.needCaseId) {
    await redis.lpush(`match:feedback-by-needcase:${event.needCaseId}`, event.feedbackId);
  }
}

export async function getMatchFeedbackEvents(
  options?: { days?: number; limit?: number },
): Promise<MatchFeedbackEvent[]> {
  const days = options?.days ?? 30;
  const limit = options?.limit ?? 500;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const redis = getRedis();

  if (!redis) {
    return [...memoryFeedbackEvents.values()]
      .filter(event => event.createdAt >= cutoff)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  const ids = await redis.lrange<string>('match:feedback', 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis.get<MatchFeedbackEvent>(feedbackKey(id))));
  return items.filter((event): event is MatchFeedbackEvent => event !== null && event.createdAt >= cutoff);
}

export async function getMatchFeedbackByNeedCase(needCaseId: string): Promise<MatchFeedbackEvent[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memoryFeedbackEvents.values()]
      .filter(e => e.needCaseId === needCaseId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  const ids = await redis.lrange<string>(`match:feedback-by-needcase:${needCaseId}`, 0, -1);
  const items = await Promise.all(ids.map(id => redis.get<MatchFeedbackEvent>(feedbackKey(id))));
  return items.filter((e): e is MatchFeedbackEvent => e !== null);
}

// ---------------------------------------------------------------------------
// Port 工厂 —— 上层依赖 FeedbackRepositoryPort 接口，不依赖具体函数
// ---------------------------------------------------------------------------

export function createFeedbackStore(): FeedbackRepositoryPort {
  return {
    async save(event: MatchFeedbackEvent): Promise<void> {
      await saveMatchFeedback(event);
    },

    async findRecent(days: number, limit = 500): Promise<MatchFeedbackEvent[]> {
      return getMatchFeedbackEvents({ days, limit });
    },

    async findByNeedCase(needCaseId: string): Promise<MatchFeedbackEvent[]> {
      return getMatchFeedbackByNeedCase(needCaseId);
    },
  };
}
