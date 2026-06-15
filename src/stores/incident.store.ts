/**
 * Incident Store — 实现 IncidentRepositoryPort
 *
 * 安全事件存储：失败降级、连续失败、权限异常等记录。
 */

import type { Incident, IncidentRepositoryPort } from './ports';

import { getUnresolvedIncidents, saveIncident } from '@/conversation/store';

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
