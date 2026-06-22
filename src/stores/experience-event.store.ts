/**
 * Experience Event Store
 *
 * 经验事件（U10 经验验证系统：原始事件采集 → 复盘 → 模式 → 方法成熟度）
 * 域的真实存储实现（Redis + 内存降级）。
 * 原先寄居于 conversation/store.ts，现迁入本域 Store，保持四层架构的数据边界。
 *
 * 键约定：
 *   match:experience:{experienceId}   单实体
 *   match:experiences:recent          最近事件索引（LPUSH id + LTRIM 500）
 */
import { getRedis } from '@/stores/redis-client';

import type { ExperienceEvent } from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储
// ---------------------------------------------------------------------------

const memoryExperienceEvents = new Map<string, ExperienceEvent>();

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

function experienceKey(experienceId: string): string {
  return `match:experience:${experienceId}`;
}

// ---------------------------------------------------------------------------
// Experience Event CRUD
// ---------------------------------------------------------------------------

export async function saveExperienceEvent(event: ExperienceEvent): Promise<void> {
  const redis = getRedis();
  memoryExperienceEvents.set(event.experienceId, event);
  if (!redis) return;
  await redis.set(experienceKey(event.experienceId), event);
  await redis.lpush('match:experiences:recent', event.experienceId);
  await redis.ltrim('match:experiences:recent', 0, 499);
}

export async function findRecentExperienceEvents(limit = 50): Promise<ExperienceEvent[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memoryExperienceEvents.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  try {
    const ids = await redis.lrange<string>('match:experiences:recent', 0, Math.max(0, limit - 1));
    const items = await Promise.all(ids.map(id => redis.get<ExperienceEvent>(experienceKey(id))));
    return items.filter((e): e is ExperienceEvent => e !== null);
  } catch {
    return [];
  }
}

export async function findExperienceEventById(experienceId: string): Promise<ExperienceEvent | null> {
  const redis = getRedis();
  const fromMemory = memoryExperienceEvents.get(experienceId);
  if (!redis) return fromMemory ?? null;
  try {
    return (await redis.get<ExperienceEvent>(experienceKey(experienceId))) ?? fromMemory ?? null;
  } catch {
    return fromMemory ?? null;
  }
}

export async function markExperiencePattern(experienceId: string, patternMarked: boolean): Promise<void> {
  const redis = getRedis();
  const existing = memoryExperienceEvents.get(experienceId);
  if (existing) {
    memoryExperienceEvents.set(experienceId, { ...existing, patternMarked, updatedAt: new Date().toISOString() });
  }
  if (!redis) return;
  try {
    const current = await redis.get<ExperienceEvent>(experienceKey(experienceId));
    if (current) {
      await redis.set(experienceKey(experienceId), { ...current, patternMarked, updatedAt: new Date().toISOString() });
    }
  } catch { /* 静默 */ }
}

/** 更新经验事件的复盘 / 模式标记 / 成熟度 / 反馈结果（admin 复盘用） */
export async function updateExperienceEvent(
  experienceId: string,
  patch: Partial<Pick<ExperienceEvent, 'reflection' | 'patternMarked' | 'maturity' | 'feedbackResult'>>,
): Promise<void> {
  const redis = getRedis();
  const existing = memoryExperienceEvents.get(experienceId);
  if (existing) {
    memoryExperienceEvents.set(experienceId, { ...existing, ...patch, updatedAt: new Date().toISOString() });
  }
  if (!redis) return;
  try {
    const current = await redis.get<ExperienceEvent>(experienceKey(experienceId));
    if (current) {
      await redis.set(experienceKey(experienceId), { ...current, ...patch, updatedAt: new Date().toISOString() });
    }
  } catch { /* 静默 */ }
}
