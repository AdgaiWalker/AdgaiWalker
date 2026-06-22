/**
 * Incident Store — 实现 IncidentRepositoryPort
 *
 * 安全事件存储：失败降级、连续失败、权限异常等记录（Redis + 内存降级）。
 * 原先寄居于 conversation/store.ts，现迁入本域 Store，保持四层架构的数据边界。
 */
import { getRedis } from '@/stores/redis-client';

import type { Incident, IncidentRepositoryPort } from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储
// ---------------------------------------------------------------------------

const memoryIncidents = new Map<string, Incident>();

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

function incidentKey(incidentId: string): string {
  return `admin:incident:${incidentId}`;
}

// ---------------------------------------------------------------------------
// 安全事件
// ---------------------------------------------------------------------------

export async function saveIncident(incident: Incident): Promise<void> {
  const redis = getRedis();
  memoryIncidents.set(incident.incidentId, incident);
  if (!redis) return;
  await redis.set(incidentKey(incident.incidentId), incident);
  if (!incident.resolved) {
    await redis.lpush('admin:incidents:unresolved', incident.incidentId);
  }
}

export async function getUnresolvedIncidents(limit = 50): Promise<Incident[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memoryIncidents.values()]
      .filter(i => !i.resolved)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  const ids = await redis.lrange<string>('admin:incidents:unresolved', 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis.get<Incident>(incidentKey(id))));
  return items.filter((i): i is Incident => i !== null && !i.resolved);
}

// ---------------------------------------------------------------------------
// Port 适配器：把上面的存储函数适配成 IncidentRepositoryPort
// ---------------------------------------------------------------------------

export function createIncidentStore(): IncidentRepositoryPort {
  return {
    async save(incident: Incident): Promise<void> {
      await saveIncident(incident);
    },

    async findUnresolved(limit = 50): Promise<Incident[]> {
      return getUnresolvedIncidents(limit);
    },
  };
}
