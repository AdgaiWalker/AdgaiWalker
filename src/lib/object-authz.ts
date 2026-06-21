/**
 * object-authz.ts —— P4 Contributor 对象级授权（默认拒绝）
 *
 * spec §29：Contributor 按对象授权，不一次性开放整个后台。
 *
 * 设计（默认拒绝 / 不触动既有认证边界）：
 * - 不修改 AccountRole 枚举。Contributor = role='user' + 至少一条 ObjectGrant。
 * - owner 对一切资源有权限；admin 在既有 isAdmin 范围内已全覆盖（对象授权主要服务 sub-admin contributor）。
 * - 其余身份（user/anonymous）必须命中一条**未过期**的 grant（resourceType 匹配 + resourceId 匹配或 '*' + actions 含目标动作）。
 * - 每次决策写一条 ActionAuditEntry（allowed/denied），Contributor 不可修改审计。
 *
 * 信任边界（spec §29）：requireObjectPermission 默认返回 false（拒绝），只有显式 grant 或 owner 才放行。
 */

import { randomUUID } from 'node:crypto';

import { readSessionPayload } from './account-auth';
import { createSessionStore } from '@/stores/session.store';
import {
  findObjectGrantsByGrantee,
  saveActionAudit,
} from '@/conversation/store';
import type { AccountRole, ObjectGrant } from '@/stores/ports';

export interface ActorIdentity {
  /** 用户名；未登录或解析失败为 null */
  username: string | null;
  role: AccountRole | 'anonymous';
}

/**
 * 从请求解析操作者身份（username 需经 session store 查 sid→session→username，异步）。
 * 未登录或会话失效 → { username: null, role: 'anonymous' }。
 */
export async function resolveActorIdentity(request: Request): Promise<ActorIdentity> {
  const payload = readSessionPayload(request);
  if (!payload) return { username: null, role: 'anonymous' };
  const role = (payload.role as AccountRole) ?? 'anonymous';
  let username: string | null = null;
  try {
    const sessions = createSessionStore();
    const session = await sessions.get(payload.sid);
    username = session?.username ?? null;
  } catch {
    username = null;
  }
  return { username, role };
}

function grantCovers(grant: ObjectGrant, resourceType: string, resourceId: string, action: string, now: string): boolean {
  if (grant.resourceType !== resourceType) return false;
  if (grant.resourceId !== '*' && grant.resourceId !== resourceId) return false;
  if (!grant.actions.includes(action)) return false;
  if (grant.expiresAt && grant.expiresAt < now) return false;
  return true;
}

/**
 * 默认拒绝的对象级权限判定。owner 全通过；admin 全通过（既有后台范围）；
 * 其余身份需命中未过期 grant。无 grant 或过期 → false。
 */
export async function canPerformObjectAction(
  actor: ActorIdentity,
  resourceType: string,
  resourceId: string,
  action: string,
): Promise<boolean> {
  if (actor.role === 'owner') return true;
  if (actor.role === 'admin') return true;
  if (!actor.username) return false;
  const now = new Date().toISOString();
  const grants = await findObjectGrantsByGrantee(actor.username, resourceType);
  return grants.some(g => grantCovers(g, resourceType, resourceId, action, now));
}

/**
 * 判定 + 审计一体：返回是否放行，并写一条 ActionAuditEntry（allowed/denied + reason）。
 * 审计写入失败不影响判定结果（审计是观测，不是门闩；高风险动作的门闩由 admin-audit.ts 独立承担）。
 */
export async function authorizeAndAudit(
  request: Request,
  resourceType: string,
  resourceId: string,
  action: string,
): Promise<{ allowed: boolean; actor: ActorIdentity; reason: string }> {
  const actor = await resolveActorIdentity(request);
  const allowed = await canPerformObjectAction(actor, resourceType, resourceId, action);
  const reason = allowed
    ? (actor.role === 'owner' ? 'owner 全权限' : actor.role === 'admin' ? 'admin 后台权限' : '对象授权命中')
    : (actor.username ? '无匹配对象授权' : '未登录');
  try {
    await saveActionAudit({
      auditId: `aa_${randomUUID()}`,
      actor: actor.username ?? 'anonymous',
      role: actor.role,
      action,
      resourceType,
      resourceId,
      result: allowed ? 'allowed' : 'denied',
      reason,
      occurredAt: new Date().toISOString(),
    });
  } catch {
    // 审计失败不影响判定
  }
  return { allowed, actor, reason };
}
