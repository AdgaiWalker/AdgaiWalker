/**
 * Object Grant Store — 实现 ObjectGrantRepositoryPort（spec §29 RBAC）
 *
 * P4 Contributor 对象级授权存储（Redis + 内存降级）。
 * 原先寄居于 conversation/store.ts，现迁入本域 Store，保持四层架构的数据边界。
 *
 * 域拆分说明：
 *  - 历史上 memoryObjectGrants 与 memoryActionAudit 同处 conversation/store.ts，
 *    且 __resetMemoryObjectGrants 一并清空两者。
 *  - 拆分后本文件只持有 memoryObjectGrants；__resetMemoryObjectGrants 只清空本域 Map。
 *    memoryActionAudit 归 action-audit.store.ts 所有，由其 __resetMemoryActionAudit 清空。
 *  - ACTION_AUDIT_RECENT（'action-audit:recent'）是 action-audit 域的 Redis 索引键，
 *    仅被 action-audit 存储函数使用，已随 action-audit.store.ts 迁出（本文件不持有）。
 */
import { getRedis } from '@/stores/redis-client';

import type { ObjectGrant, ObjectGrantRepositoryPort } from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储
// ---------------------------------------------------------------------------

const memoryObjectGrants = new Map<string, ObjectGrant>();

// ---------------------------------------------------------------------------
// Redis key 约定
//   object-grant:{grantId}                单条授权
//   object-grant:by-grantee:{username}    某用户的所有授权（按 resourceType 可再过滤）
//   object-grant:recent                   最近授权索引（LPUSH + LTRIM 500）
// ---------------------------------------------------------------------------

function objectGrantKey(grantId: string): string {
  return `object-grant:${grantId}`;
}
function objectGrantByGranteeKey(username: string): string {
  return `object-grant:by-grantee:${username}`;
}

/**
 * 仅测试用：清空内存授权。
 *
 * 注意：拆分前此函数（在 conversation/store.ts 中）同时清空 memoryObjectGrants 与
 * memoryActionAudit。域拆分后本函数只清空本域的 memoryObjectGrants；
 * memoryActionAudit 由 action-audit.store.ts 的 __resetMemoryActionAudit 清空。
 * 调用方若需同时清空两者，请显式调用两个 reset。
 */
export function __resetMemoryObjectGrants(): void {
  memoryObjectGrants.clear();
}

export async function saveObjectGrant(grant: ObjectGrant): Promise<void> {
  memoryObjectGrants.set(grant.grantId, grant);
  const redis = getRedis();
  if (!redis) return;
  const tx = redis.multi();
  tx.set(objectGrantKey(grant.grantId), grant);
  tx.lpush(objectGrantByGranteeKey(grant.grantee), grant.grantId);
  tx.lpush('object-grant:recent', grant.grantId);
  tx.ltrim('object-grant:recent', 0, 499);
  await tx.exec();
}

/** 列出全部 grant（按时间倒序，admin 管理面用；不分类）。 */
export async function findAllObjectGrants(limit = 200): Promise<ObjectGrant[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memoryObjectGrants.values()]
      .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))
      .slice(0, limit);
  }
  // 无全局索引；遍历 by-grantee 集合不可行（未维护用户集合）。退化为内存读 + Redis 全 scan 的并集。
  // grant 量小（单作者系统），可接受。用内存兜底保证 dev 一致；生产 Redis 路径按 grantId 遍历需索引，
  // 当前用一个 recent 列表索引（saveObjectGrant 时维护）。
  const ids = await redis.lrange<string>('object-grant:recent', 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis!.get<ObjectGrant>(objectGrantKey(id))));
  return items.filter((g): g is ObjectGrant => g !== null)
    .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
}

export async function findObjectGrantsByGrantee(
  username: string,
  resourceType?: string,
): Promise<ObjectGrant[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(objectGrantByGranteeKey(username), 0, 199);
  } else {
    ids = [...memoryObjectGrants.values()].filter(g => g.grantee === username).map(g => g.grantId);
  }
  const fetch = redis
    ? (await Promise.all(ids.map(id => redis!.get<ObjectGrant>(objectGrantKey(id)))))
        .filter((g): g is ObjectGrant => g !== null)
    : ids.map(id => memoryObjectGrants.get(id)).filter((g): g is ObjectGrant => Boolean(g));
  return fetch.filter(g => g.grantee === username && (!resourceType || g.resourceType === resourceType));
}

export async function revokeObjectGrant(grantId: string): Promise<void> {
  const existing = memoryObjectGrants.get(grantId);
  memoryObjectGrants.delete(grantId);
  const redis = getRedis();
  if (!redis) return;
  const current = await redis.get<ObjectGrant>(objectGrantKey(grantId));
  const tx = redis.multi();
  tx.del(objectGrantKey(grantId));
  if (current ?? existing) {
    tx.lrem(objectGrantByGranteeKey((current ?? existing)!.grantee), 0, grantId);
  }
  await tx.exec();
}

// ---------------------------------------------------------------------------
// Port 适配器：把上面的存储函数适配成 ObjectGrantRepositoryPort
//
// 注：findAllObjectGrants 不属于 ObjectGrantRepositoryPort（admin 管理面直接调用导出函数），
//     故未纳入工厂；工厂仅暴露 Port 声明的 save / findByGrantee / revoke。
// ---------------------------------------------------------------------------

export function createObjectGrantStore(): ObjectGrantRepositoryPort {
  return {
    async save(grant: ObjectGrant): Promise<void> {
      await saveObjectGrant(grant);
    },

    async findByGrantee(grantee: string, resourceType?: string): Promise<ObjectGrant[]> {
      return findObjectGrantsByGrantee(grantee, resourceType);
    },

    async revoke(grantId: string): Promise<void> {
      await revokeObjectGrant(grantId);
    },
  };
}
