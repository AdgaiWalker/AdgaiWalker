/**
 * Search Store — 搜索无结果记录（内容缺口信号）
 *
 * 搜索无结果记录的读取实现（Redis only）。
 * 存储逻辑从 conversation/store.ts 迁移至此，成为搜索域的权威存储入口。
 *
 * Key 约定：
 *   search:misses   搜索无结果记录列表（由 /api/search-events 写入）
 */
import { getRedis } from '@/stores/redis-client';

// ---------------------------------------------------------------------------
// 搜索无结果记录（内容缺口信号，由 /api/search-events 写入）
// ---------------------------------------------------------------------------

export interface SearchMiss {
  query: string;
  count: number;
  lastSeen: string;
}

/** 读搜索无结果记录，按查询频率聚合（高频 = 内容缺口信号） */
export async function getSearchMisses(limit = 20): Promise<SearchMiss[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const raw = await redis.lrange<string>('search:misses', 0, 199);
    const counts = new Map<string, { count: number; lastSeen: number }>();
    for (const r of raw) {
      try {
        const item = JSON.parse(r) as { q?: string; t?: number };
        if (!item.q) continue;
        const existing = counts.get(item.q);
        const ts = item.t ?? Date.now();
        if (existing) {
          existing.count += 1;
          if (ts > existing.lastSeen) existing.lastSeen = ts;
        } else {
          counts.set(item.q, { count: 1, lastSeen: ts });
        }
      } catch { /* skip malformed */ }
    }
    return [...counts.entries()]
      .map(([query, v]) => ({ query, count: v.count, lastSeen: new Date(v.lastSeen).toISOString() }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  } catch {
    return [];
  }
}
