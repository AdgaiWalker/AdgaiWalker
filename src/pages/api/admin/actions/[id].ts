/**
 * PATCH /api/admin/actions/[id] —— 更新行动状态（P0-C02）
 *
 * 请求体：
 *   workItemId, status, reason?, targetId?
 *
 * 路由参数 id 是 actionId。actor 由服务端派生。
 * admin only；Cache-Control: no-store。
 */
import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { resolveAdminActor } from '@/lib/admin-actor';
import { createWorkbenchService } from '@/services/workbench.service';
import type { WorkItemAction } from '@/stores/ports';

export const prerender = false;

const VALID_STATUSES: WorkItemAction['status'][] = [
  'authorized', 'in-progress', 'awaiting-verification', 'completed', 'blocked', 'cancelled',
];

const STATUS_BY_CODE: Record<string, number> = {
  ok: 200,
  'not-found': 404,
  'invalid-transition': 409,
  'missing-evidence': 409,
  'missing-expected-outcome': 409,
  'storage-unavailable': 503,
  'invalid-input': 400,
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const PATCH: APIRoute = async ({ request, params }) => {
  if (!isAdmin(request)) return json({ error: '未授权。' }, 401);

  const actionId = params.id;
  if (!actionId) return json({ error: '缺少行动 ID。' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误。' }, 400);
  }

  if (typeof body.workItemId !== 'string' || !body.workItemId) {
    return json({ error: 'workItemId 不能为空。' }, 400);
  }
  if (typeof body.status !== 'string' || !VALID_STATUSES.includes(body.status as WorkItemAction['status'])) {
    return json({ error: 'status 不合法。' }, 400);
  }

  const actor = await resolveAdminActor(request);
  const service = createWorkbenchService();
  const result = await service.updateAction(body.workItemId, actionId, {
    status: body.status as WorkItemAction['status'],
    actor,
    reason: typeof body.reason === 'string' ? body.reason : undefined,
    targetId: typeof body.targetId === 'string' && body.targetId ? body.targetId : undefined,
  });

  if (!result.ok) {
    return json({ error: result.message ?? '更新行动失败。', code: result.code }, STATUS_BY_CODE[result.code] ?? 400);
  }
  return json({ ok: true, item: result.data });
};
