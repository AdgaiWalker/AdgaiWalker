/**
 * POST /api/admin/accounts/reset — 站主重置某用户密码（忘密唯一通道）
 *
 * body: { username } → 生成临时密码并覆盖，返回明文（仅显示一次）。
 */
import type { APIRoute } from 'astro';

import { isAdminAsync } from '@/lib/admin-auth';
import { captureException } from '@/lib/sentry';
import { requireHighRiskAudit } from '@/lib/admin-audit';
import { resolveAdminActor } from '@/lib/admin-actor';
import { createAccountService } from '@/services/account.service';
import { createSessionStore } from '@/stores/session.store';

const sessionStore = createSessionStore();
const accountService = createAccountService();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) {
    return json({ ok: false, reason: '未授权。' }, 401);
  }
  let body: { username?: unknown };
  try {
    body = await request.json();
  } catch (error) {
    captureException(error, { action: 'account.password.reset' });
    return json({ ok: false, reason: '请求格式不正确。' }, 400);
  }
  const { username } = body;
  if (typeof username !== 'string' || !username) {
    return json({ ok: false, reason: '请指定用户名。' }, 400);
  }
  const actor = await resolveAdminActor(request);
  const audit = await requireHighRiskAudit({
    actor,
    action: 'account.password.reset',
    targetType: 'account',
    targetId: username,
    reason: '重置账号密码会撤销该用户全部会话并生成一次性临时密码。',
  });
  if (!audit.ok) return json({ ok: false, reason: audit.reason, code: audit.code }, audit.status);

  const result = await accountService.resetPassword(username);
  if (!result.ok) {
    return json(result, 400);
  }
  return json({ ok: true, newPassword: result.newPassword });
};
