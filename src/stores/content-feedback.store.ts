/**
 * ContentFeedback Store — 实现 ContentFeedbackRepositoryPort（P1-A）
 *
 * 内容阅读反馈存储的真正实现（Redis + 内存降级）。
 * 存储逻辑从 conversation/store.ts 迁移至此，成为 ContentFeedback 域的权威存储入口。
 * 与 MatchFeedback 完全分开存储、分开计算（hai-razor 保留复杂度）。
 *
 * Key 约定：
 *   content-feedback:event:{id}            单事件
 *   content-feedback:recent                最近事件索引（LPUSH id + LTRIM 1000）
 *   content-feedback:content:{contentId}   按内容索引
 *   content-feedback:topic:{topicId}       按选题索引（sourceTopicId 派生）
 */
import { getRedis } from '@/stores/redis-client';

import type { ContentFeedbackEvent, ContentFeedbackRepositoryPort } from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储（Redis 不可用时兜底）
// ---------------------------------------------------------------------------

const memoryContentFeedback = new Map<string, ContentFeedbackEvent>();

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

function contentFeedbackKey(feedbackId: string): string {
  return `content-feedback:event:${feedbackId}`;
}
function contentFeedbackByContentKey(contentId: string): string {
  return `content-feedback:content:${contentId}`;
}
function contentFeedbackByTopicKey(topicId: string): string {
  return `content-feedback:topic:${topicId}`;
}
const CONTENT_FEEDBACK_RECENT = 'content-feedback:recent';

/**
 * 生产等价存储验证（scripts/verify-production-storage.mjs）键名真相源。
 * 注意 ContentFeedback 键没有 `match:` 前缀，与 WorkItem 不同。
 */
export const CONTENT_FEEDBACK_REDIS_KEYS = {
  event: contentFeedbackKey,
  recent: CONTENT_FEEDBACK_RECENT,
  byContent: contentFeedbackByContentKey,
} as const;

/** 仅开发期测试用：清空内存 ContentFeedback，不触碰 Redis。 */
export function __resetMemoryContentFeedback(): void {
  memoryContentFeedback.clear();
}

/** 仅开发演示场景用：清理指定前缀的内存 ContentFeedback，不触碰真实 Redis。 */
export function __deleteMemoryContentFeedbackByPrefix(prefix: string): number {
  let deleted = 0;
  for (const id of [...memoryContentFeedback.keys()]) {
    if (id.startsWith(prefix)) {
      memoryContentFeedback.delete(id);
      deleted += 1;
    }
  }
  return deleted;
}

function inRange(event: ContentFeedbackEvent, range?: { from?: string; to?: string }): boolean {
  if (!range) return true;
  if (range.from && event.createdAt < range.from) return false;
  if (range.to && event.createdAt > range.to) return false;
  return true;
}

async function fetchByIds(ids: string[]): Promise<ContentFeedbackEvent[]> {
  const redis = getRedis();
  if (redis) {
    const items = await Promise.all(ids.map(id => redis!.get<ContentFeedbackEvent>(contentFeedbackKey(id))));
    return items.filter((e): e is ContentFeedbackEvent => e !== null);
  }
  return ids.map(id => memoryContentFeedback.get(id)).filter((e): e is ContentFeedbackEvent => e !== null);
}

export async function saveContentFeedback(event: ContentFeedbackEvent): Promise<void> {
  memoryContentFeedback.set(event.feedbackId, event);
  const redis = getRedis();
  if (!redis) return;
  await redis.set(contentFeedbackKey(event.feedbackId), event);
  await redis.lpush(CONTENT_FEEDBACK_RECENT, event.feedbackId);
  await redis.ltrim(CONTENT_FEEDBACK_RECENT, 0, 999);
  await redis.lpush(contentFeedbackByContentKey(event.contentId), event.feedbackId);
  if (event.sourceTopicId) {
    await redis.lpush(contentFeedbackByTopicKey(event.sourceTopicId), event.feedbackId);
  }
}

export async function findContentFeedbackByContent(
  contentId: string,
  range?: { from?: string; to?: string },
): Promise<ContentFeedbackEvent[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(contentFeedbackByContentKey(contentId), 0, 499);
  } else {
    ids = [...memoryContentFeedback.values()]
      .filter(e => e.contentId === contentId)
      .map(e => e.feedbackId);
  }
  const items = await fetchByIds(ids);
  return items.filter(e => e.contentId === contentId && inRange(e, range));
}

export async function findContentFeedbackByTopic(
  topicId: string,
  range?: { from?: string; to?: string },
): Promise<ContentFeedbackEvent[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(contentFeedbackByTopicKey(topicId), 0, 499);
  } else {
    ids = [...memoryContentFeedback.values()]
      .filter(e => e.sourceTopicId === topicId)
      .map(e => e.feedbackId);
  }
  const items = await fetchByIds(ids);
  return items.filter(e => e.sourceTopicId === topicId && inRange(e, range));
}

export async function findRecentContentFeedback(
  range?: { from?: string; to?: string },
  limit = 500,
): Promise<ContentFeedbackEvent[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(CONTENT_FEEDBACK_RECENT, 0, Math.max(0, limit - 1));
  } else {
    ids = [...memoryContentFeedback.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(e => e.feedbackId);
  }
  const items = await fetchByIds(ids);
  return items
    .filter(e => inRange(e, range))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Port 工厂 —— 上层依赖 ContentFeedbackRepositoryPort 接口，不依赖具体函数
// ---------------------------------------------------------------------------

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
