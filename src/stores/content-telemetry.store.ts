/**
 * ContentTelemetry Store — 实现 ContentTelemetryRepositoryPort（P3-A）
 *
 * 内容阅读深度遥测存储的真正实现（Redis + 内存降级）。
 * 存储逻辑从 conversation/store.ts 迁移至此，成为 ContentTelemetry 域的权威存储入口。
 * 与 ContentFeedback 完全分开存储、分开计算（不合并分母）。支持真实决策：
 * "哪篇内容读者读到哪 / 是否读完 → 优先改进哪篇"。
 *
 * Key 约定（无 `match:` 前缀，与 ContentFeedback 同族）：
 *   telemetry:event:{eventId}            单条事件
 *   telemetry:recent                     最近事件索引（LPUSH id + LTRIM 2000）
 *   telemetry:content:{contentId}        按内容索引（供 hit-rate readingOutcome 消费）
 */
import { getRedis } from '@/stores/redis-client';

import type { ContentTelemetryEvent, ContentTelemetryRepositoryPort } from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储（Redis 不可用时兜底）
// ---------------------------------------------------------------------------

const memoryContentTelemetry = new Map<string, ContentTelemetryEvent>();

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

function contentTelemetryKey(eventId: string): string {
  return `telemetry:event:${eventId}`;
}
function contentTelemetryByContentKey(contentId: string): string {
  return `telemetry:content:${contentId}`;
}
const CONTENT_TELEMETRY_RECENT = 'telemetry:recent';

/**
 * 生产等价存储验证键名真相源（与 WORKITEM_REDIS_KEYS / CONTENT_FEEDBACK_REDIS_KEYS 同模式）。
 */
export const CONTENT_TELEMETRY_REDIS_KEYS = {
  event: contentTelemetryKey,
  recent: CONTENT_TELEMETRY_RECENT,
  byContent: contentTelemetryByContentKey,
} as const;

/** 仅测试用：清空内存 ContentTelemetry，不触碰 Redis。 */
export function __resetMemoryContentTelemetry(): void {
  memoryContentTelemetry.clear();
}

function telemetryInRange(event: ContentTelemetryEvent, range?: { from?: string; to?: string }): boolean {
  if (!range) return true;
  if (range.from && event.createdAt < range.from) return false;
  if (range.to && event.createdAt > range.to) return false;
  return true;
}

async function fetchTelemetryByIds(ids: string[]): Promise<ContentTelemetryEvent[]> {
  const redis = getRedis();
  if (redis) {
    const items = await Promise.all(ids.map(id => redis!.get<ContentTelemetryEvent>(contentTelemetryKey(id))));
    return items.filter((e): e is ContentTelemetryEvent => e !== null);
  }
  return ids.map(id => memoryContentTelemetry.get(id)).filter((e): e is ContentTelemetryEvent => e !== null);
}

export async function saveContentTelemetry(event: ContentTelemetryEvent): Promise<void> {
  memoryContentTelemetry.set(event.eventId, event);
  const redis = getRedis();
  if (!redis) return;
  // P0-B02 同款 MULTI 原子事务：实体 + recent 索引 + by-content 索引一起提交，
  // 避免 set 后 lpush 前失败留下"实体已写但索引丢"的不一致。
  const tx = redis.multi();
  tx.set(contentTelemetryKey(event.eventId), event);
  tx.lpush(CONTENT_TELEMETRY_RECENT, event.eventId);
  tx.ltrim(CONTENT_TELEMETRY_RECENT, 0, 1999);
  tx.lpush(contentTelemetryByContentKey(event.contentId), event.eventId);
  await tx.exec();
}

export async function findContentTelemetryByContent(
  contentId: string,
  range?: { from?: string; to?: string },
): Promise<ContentTelemetryEvent[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(contentTelemetryByContentKey(contentId), 0, 999);
  } else {
    ids = [...memoryContentTelemetry.values()]
      .filter(e => e.contentId === contentId)
      .map(e => e.eventId);
  }
  const items = await fetchTelemetryByIds(ids);
  return items.filter(e => e.contentId === contentId && telemetryInRange(e, range));
}

export async function findRecentContentTelemetry(
  range?: { from?: string; to?: string },
  limit = 2000,
): Promise<ContentTelemetryEvent[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(CONTENT_TELEMETRY_RECENT, 0, Math.max(0, limit - 1));
  } else {
    ids = [...memoryContentTelemetry.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(e => e.eventId);
  }
  const items = await fetchTelemetryByIds(ids);
  return items
    .filter(e => telemetryInRange(e, range))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Port 工厂 —— 上层依赖 ContentTelemetryRepositoryPort 接口，不依赖具体函数
// ---------------------------------------------------------------------------

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
