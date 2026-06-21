/**
 * POST /api/admin/actions —— 为 WorkItem 创建行动（P0-C02）
 *
 * 请求体：
 *   workItemId, actionType, targetType, targetId?, expectedOutcome,
 *   assignee?, verifyAt?, reversible?, rollbackPlan?
 *
 * actor 由服务端派生。admin only；Cache-Control: no-store。
 */
import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { resolveAdminActor } from '@/lib/admin-actor';
import { createWorkbenchService } from '@/services/workbench.service';
import type { WorkItemActionType } from '@/stores/ports';

export const prerender = false;

const VALID_ACTION_TYPES: WorkItemActionType[] = [
  'create-content', 'update-content', 'change-feature',
  'create-learning-request', 'review-incident', 'evaluate-asset',
];

const STATUS_BY_CODE: Record<string, number> = {
  ok: 201,
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

export const POST: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) return json({ error: '未授权。' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误。' }, 400);
  }

  const workItemId = body.workItemId;
  if (typeof workItemId !== 'string' || !workItemId) {
    return json({ error: 'workItemId 不能为空。' }, 400);
  }
  if (typeof body.actionType !== 'string' || !VALID_ACTION_TYPES.includes(body.actionType as WorkItemActionType)) {
    return json({ error: 'actionType 不合法。' }, 400);
  }
  if (typeof body.targetType !== 'string' || !body.targetType.trim()) {
    return json({ error: 'targetType 不能为空。' }, 400);
  }
  if (typeof body.expectedOutcome !== 'string' || !body.expectedOutcome.trim()) {
    return json({ error: 'expectedOutcome 不能为空。' }, 400);
  }

  const actor = await resolveAdminActor(request);
  const service = createWorkbenchService();
  const result = await service.createAction(workItemId, {
    actionType: body.actionType as WorkItemActionType,
    targetType: body.targetType,
    targetId: typeof body.targetId === 'string' && body.targetId ? body.targetId : undefined,
    expectedOutcome: body.expectedOutcome,
    assignee: body.assignee === 'walker' || body.assignee === 'ai' || body.assignee === 'shared' ? body.assignee : undefined,
    verifyAt: typeof body.verifyAt === 'string' ? body.verifyAt : undefined,
    reversible: typeof body.reversible === 'boolean' ? body.reversible : undefined,
    rollbackPlan: typeof body.rollbackPlan === 'string' ? body.rollbackPlan : undefined,
    actor,
  });

  if (!result.ok) {
    return json({ error: result.message ?? '创建行动失败。', code: result.code }, STATUS_BY_CODE[result.code] ?? 400);
  }
  return json({ ok: true, item: result.data }, 201);
};
