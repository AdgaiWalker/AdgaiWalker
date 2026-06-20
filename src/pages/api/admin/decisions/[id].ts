/**
 * PATCH /api/admin/decisions/[id] —— 对 WorkItem 作出决定 / 请求决定（P0-C02）
 *
 * 请求体（二选一）：
 *   决定：{ decide: { outcome: 'accepted'|'rejected'|'paused', reason } }
 *   请求决定：{ requestDecision: true }
 *
 * actor 由服务端派生。admin only；Cache-Control: no-store。
 */
import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { resolveAdminActor } from '@/lib/admin-actor';
import { createWorkbenchService } from '@/services/workbench.service';

export const prerender = false;

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

  const id = params.id;
  if (!id) return json({ error: '缺少工作项 ID。' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误。' }, 400);
  }

  const actor = await resolveAdminActor(request);
  const service = createWorkbenchService();

  if (body.requestDecision === true) {
    const result = await service.requestDecision(id, actor);
    if (!result.ok) {
      return json({ error: result.message ?? '请求决定失败。', code: result.code }, STATUS_BY_CODE[result.code] ?? 400);
    }
    return json({ ok: true, item: result.data });
  }

  const decide = body.decide as Record<string, unknown> | undefined;
  if (!decide || typeof decide !== 'object') {
    return json({ error: '请求体需包含 decide 或 requestDecision。' }, 400);
  }
  const outcome = decide.outcome;
  if (outcome !== 'accepted' && outcome !== 'rejected' && outcome !== 'paused') {
    return json({ error: 'decide.outcome 不合法。' }, 400);
  }
  if (typeof decide.reason !== 'string' || !decide.reason.trim()) {
    return json({ error: 'decide.reason 不能为空。' }, 400);
  }

  const result = await service.decide(id, { outcome, reason: decide.reason, actor });
  if (!result.ok) {
    return json({ error: result.message ?? '决定失败。', code: result.code }, STATUS_BY_CODE[result.code] ?? 400);
  }
  return json({ ok: true, item: result.data });
};
