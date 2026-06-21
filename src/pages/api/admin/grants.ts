/**
 * /api/admin/grants —— Contributor 对象级授权管理（P4 spec §29）
 *
 * owner only（授权是高权限动作）。 contributor 由 owner 在此配 grant 后获得受限后台访问。
 * - GET    ?grantee=username  列出 grant（可按 grantee 过滤）
 * - POST                     创建 grant（grantee/resourceType/resourceId/actions/expiresAt?/reason）
 * - DELETE  ?grantId=         撤销 grant
 *
 * grant 的 resourceType/resourceId/actions 由 canAccessAdminResource 消费（admin 端点把 isAdmin 放宽为 isAdmin||grant）。
 * Cache-Control: no-store。
 */
import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';

import { isOwner } from '@/lib/admin-auth';
import { resolveAdminActor } from '@/lib/admin-actor';
import { findAllObjectGrants, findObjectGrantsByGrantee, saveObjectGrant, revokeObjectGrant } from '@/conversation/store';
import type { ObjectGrant } from '@/stores/ports';

export const prerender = false;

const VALID_RESOURCE_TYPES = new Set(['content', 'workitem', 'skill', 'insights', 'hit-rate', 'northstar']);
const VALID_ACTIONS = new Set(['read', 'write', 'comment', 'review', 'evaluate']);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!isOwner(request)) return json({ error: '仅站主可管理授权。' }, 403);
  const grantee = url.searchParams.get('grantee');
  const grants = grantee
    ? await findObjectGrantsByGrantee(grantee)
    : await findAllObjectGrants();
  return json({ grants, count: grants.length });
};

export const POST: APIRoute = async ({ request }) => {
  if (!isOwner(request)) return json({ error: '仅站主可管理授权。' }, 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误。' }, 400); }

  const grantee = typeof body.grantee === 'string' ? body.grantee.trim() : '';
  const resourceType = typeof body.resourceType === 'string' ? body.resourceType : '';
  const resourceId = typeof body.resourceId === 'string' ? body.resourceId.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!grantee) return json({ error: 'grantee（用户名）不能为空。' }, 400);
  if (!VALID_RESOURCE_TYPES.has(resourceType)) return json({ error: 'resourceType 不合法。' }, 400);
  if (!resourceId) return json({ error: 'resourceId 不能为空（"*" 表该类型全部）。' }, 400);
  if (!reason) return json({ error: 'reason 不能为空（授权必须留理由）。' }, 400);
  const actions = Array.isArray(body.actions)
    ? body.actions.filter((a): a is string => typeof a === 'string' && VALID_ACTIONS.has(a))
    : [];
  if (actions.length === 0) return json({ error: 'actions 至少一个（read/write/comment/review/evaluate）。' }, 400);

  const expiresAt = typeof body.expiresAt === 'string' && body.expiresAt ? body.expiresAt : undefined;
  const actor = await resolveAdminActor(request);
  const grant: ObjectGrant = {
    grantId: `og_${randomUUID()}`,
    grantee,
    resourceType,
    resourceId,
    actions,
    grantedBy: actor,
    grantedAt: new Date().toISOString(),
    expiresAt,
    reason,
  };
  await saveObjectGrant(grant);
  return json({ ok: true, grant }, 201);
};

export const DELETE: APIRoute = async ({ request, url }) => {
  if (!isOwner(request)) return json({ error: '仅站主可管理授权。' }, 403);
  const grantId = url.searchParams.get('grantId');
  if (!grantId) return json({ error: 'grantId 不能为空。' }, 400);
  await revokeObjectGrant(grantId);
  return json({ ok: true });
};
