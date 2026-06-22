/**
 * Action Audit Store — 实现 ActionAuditRepositoryPort（spec §29.4）
 *
 * P4 操作审计存储：谁在何时对什么对象执行了什么动作（Contributor 不可修改）。
 * 原先寄居于 conversation/store.ts，现迁入本域 Store，保持四层架构的数据边界。
 *
 * 域拆分说明：
 *  - 历史上 memoryActionAudit 与 memoryObjectGrants 同处 conversation/store.ts，
 *    由 __resetMemoryObjectGrants 一并清空。
 *  - 拆分后本文件只持有 memoryActionAudit，并由本文件的 __resetMemoryActionAudit 清空；
 *    memoryObjectGrants 归 object-grant.store.ts，由其 __resetMemoryObjectGrants 自行清空。
 *  - ACTION_AUDIT_RECENT（'action-audit:recent'）随本域迁出，仅在本文件使用。
 */
import { getRedis } from '@/stores/redis-client';

import type { ActionAuditEntry, ActionAuditRepositoryPort } from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储
// ---------------------------------------------------------------------------

const memoryActionAudit = new Map<string, ActionAuditEntry>();

// ---------------------------------------------------------------------------
// Redis key 约定
//   action-audit:{auditId}    单条审计
//   action-audit:recent       最近审计索引（LPUSH + LTRIM 1000）
// ---------------------------------------------------------------------------

const ACTION_AUDIT_RECENT = 'action-audit:recent';

/**
 * 仅测试用：清空内存审计。
 *
 * 注意：拆分前此职责由 conversation/store.ts 的 __resetMemoryObjectGrants 承担
 * （同时清空 memoryObjectGrants 与 memoryActionAudit）。域拆分后本函数只清空本域的
 * memoryActionAudit；memoryObjectGrants 由 object-grant.store.ts 的
 * __resetMemoryObjectGrants 清空。调用方若需同时清空两者，请显式调用两个 reset。
 */
export function __resetMemoryActionAudit(): void {
  memoryActionAudit.clear();
}

export async function saveActionAudit(entry: ActionAuditEntry): Promise<void> {
  memoryActionAudit.set(entry.auditId, entry);
  const redis = getRedis();
  if (!redis) return;
  const tx = redis.multi();
  tx.set(`action-audit:${entry.auditId}`, entry);
  tx.lpush(ACTION_AUDIT_RECENT, entry.auditId);
  tx.ltrim(ACTION_AUDIT_RECENT, 0, 999);
  await tx.exec();
}

export async function findRecentActionAudit(limit = 100): Promise<ActionAuditEntry[]> {
  const redis = getRedis();
  let ids: string[];
  if (redis) {
    ids = await redis.lrange<string>(ACTION_AUDIT_RECENT, 0, Math.max(0, limit - 1));
  } else {
    ids = [...memoryActionAudit.values()]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit)
      .map(e => e.auditId);
  }
  if (redis) {
    const items = await Promise.all(ids.map(id => redis!.get<ActionAuditEntry>(`action-audit:${id}`)));
    return items.filter((e): e is ActionAuditEntry => e !== null)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }
  return ids.map(id => memoryActionAudit.get(id)).filter((e): e is ActionAuditEntry => Boolean(e))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

// ---------------------------------------------------------------------------
// Port 适配器：把上面的存储函数适配成 ActionAuditRepositoryPort
// ---------------------------------------------------------------------------

export function createActionAuditStore(): ActionAuditRepositoryPort {
  return {
    async save(entry: ActionAuditEntry): Promise<void> {
      await saveActionAudit(entry);
    },

    async findRecent(limit = 100): Promise<ActionAuditEntry[]> {
      return findRecentActionAudit(limit);
    },
  };
}
