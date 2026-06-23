/**
 * Collaborator Store — 管理“靠近这个想法”的同频者申请
 *
 * 哲学遵循：去中心化协作与和谐共生。
 *
 * Key 约定：
 *   dianzi:collaborator:event:${id}            单事件
 *   dianzi:collaborator:content:${contentId}   按内容索引 (LPUSH id)
 */
import { getRedis } from '@/stores/redis-client';

export interface CollaboratorApplication {
  id: string;
  contentId: string;
  role: string;          // 我的技能身份
  suggestion: string;    // 我对此的第一步行动建议
  createdAt: string;     // ISO timestamp
  ip?: string;           // 屏蔽的 IP (防刷)
}

const memoryCollaborators = new Map<string, CollaboratorApplication>();

function collaboratorKey(appId: string): string {
  return `dianzi:collaborator:event:${appId}`;
}

function collaboratorByContentKey(contentId: string): string {
  return `dianzi:collaborator:content:${contentId}`;
}

export async function saveCollaboratorApplication(app: CollaboratorApplication): Promise<void> {
  memoryCollaborators.set(app.id, app);
  const redis = getRedis();
  if (!redis) return;

  await redis.set(collaboratorKey(app.id), app);
  await redis.lpush(collaboratorByContentKey(app.contentId), app.id);
}

export async function findCollaboratorsByContent(contentId: string): Promise<CollaboratorApplication[]> {
  const redis = getRedis();
  if (redis) {
    const ids = await redis.lrange(collaboratorByContentKey(contentId), 0, -1);
    if (!ids || ids.length === 0) return [];
    const items = await Promise.all(ids.map(id => redis.get<CollaboratorApplication>(collaboratorKey(id))));
    return items.filter((e): e is CollaboratorApplication => e !== null);
  }

  // 内存回退
  return Array.from(memoryCollaborators.values())
    .filter(app => app.contentId === contentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCollaboratorCountByContent(contentId: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const len = await redis.llen(collaboratorByContentKey(contentId));
    return len || 0;
  }
  return Array.from(memoryCollaborators.values()).filter(app => app.contentId === contentId).length;
}

export function __resetMemoryCollaboratorStore(): void {
  memoryCollaborators.clear();
}
