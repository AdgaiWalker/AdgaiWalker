/**
 * POST /api/admin/accounts/status — 站主封禁 / 解封某用户
 *
 * body: { username, status: 'active' | 'banned' }
 */
import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { requireHighRiskAudit } from '@/lib/admin-audit';
import { resolveAdminActor } from '@/lib/admin-actor';
import { createAccountService } from '@/services/account.service';
import type { AccountStatus } from '@/stores/ports';

const accountService = createAccountService();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) {
    return json({ ok: false, reason: '未授权。' }, 401);
  }
  let body: { username?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: '请求格式不正确。' }, 400);
  }
  const { username, status } = body;
  if (typeof username !== 'string' || !username) {
    return json({ ok: false, reason: '请指定用户名。' }, 400);
  }
  if (status !== 'active' && status !== 'banned') {
    return json({ ok: false, reason: 'status 必须是 active 或 banned。' }, 400);
  }
  const actor = await resolveAdminActor(request);
  const audit = await requireHighRiskAudit({
    actor,
    action: 'account.status.update',
    targetType: 'account',
    targetId: username,
    reason: `账号状态变更为 ${status}。`,
    detail: { status },
  });
  if (!audit.ok) return json({ ok: false, reason: audit.reason, code: audit.code }, audit.status);

  const result = await accountService.setStatus(username, status as AccountStatus);
  if (!result.ok) {
    return json(result, 400);
  }
  return json({ ok: true });
};
