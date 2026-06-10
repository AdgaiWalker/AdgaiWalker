/**
 * 需求事件 Store — 实现 DemandEventRepositoryPort
 *
 * 第一版：委托给 conversation/store.ts 的现有逻辑，
 * 保持 Redis + 内存双写兼容。
 */

import type { DemandEvent, DemandEventRepositoryPort } from './ports';

import {
  getRedis,
  saveDemandEvent as legacySave,
  getPendingDemandEvents as legacyPending,
  markDemandEventsProcessed as legacyMark,
} from '@/conversation/store';

const EVENT_KEY_PREFIX = 'match:event:';

export function createDemandEventStore(): DemandEventRepositoryPort {
  return {
    async save(event: DemandEvent): Promise<void> {
      await legacySave(event as Parameters<typeof legacySave>[0]);
    },

    async findPending(limit = 50): Promise<DemandEvent[]> {
      return legacyPending(limit) as Promise<DemandEvent[]>;
    },

    async markProcessed(eventIds: string[]): Promise<void> {
      await legacyMark(eventIds);
    },

    async findRecent(days: number): Promise<DemandEvent[]> {
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      const redis = getRedis();

      if (redis) {
        const keys = await redis.keys(EVENT_KEY_PREFIX + '*');
        const items = await Promise.all(
          keys.map(key => redis.get<DemandEvent>(key)),
        );
        return items.filter(
          (e): e is DemandEvent => e !== null && e.createdAt >= cutoff,
        );
      }

      const pending = await legacyPending(1000);
      return pending.filter(e => e.createdAt >= cutoff);
    },
  };
}
