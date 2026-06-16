/**
 * POST /api/admin/accounts/reset — 站主重置某用户密码（忘密唯一通道）
 *
 * body: { username } → 生成临时密码并覆盖，返回明文（仅显示一次）。
 */
import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { createAccountService } from '@/services/account.service';

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
  let body: { username?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: '请求格式不正确。' }, 400);
  }
  const { username } = body;
  if (typeof username !== 'string' || !username) {
    return json({ ok: false, reason: '请指定用户名。' }, 400);
  }
  const result = await accountService.resetPassword(username);
  if (!result.ok) {
    return json(result, 400);
  }
  return json({ ok: true, newPassword: result.newPassword });
};
