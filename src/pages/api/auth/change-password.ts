/**
 * POST /api/auth/change-password — 用户自助改密（需当前密码）
 *
 * body: { currentPassword, newPassword }
 * 从会话解析 username，调 accountService.changePassword。
 */
import type { APIRoute } from 'astro';

import { readSessionId } from '@/lib/account-auth';
import { createAccountService } from '@/services/account.service';
import { createUserContextService } from '@/services/user-context.service';
import { createAccountStore } from '@/stores/account.store';
import { createSessionStore } from '@/stores/session.store';
import { createUserProfileStore } from '@/stores/user-profile.store';

const accountService = createAccountService();
const userContextService = createUserContextService({
  sessionStore: createSessionStore(),
  accountStore: createAccountStore(),
  profileStore: createUserProfileStore(),
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const userContext = await userContextService.resolve({
    sessionId: readSessionId(request),
    isAdmin: false,
  });
  if (userContext.authState !== 'user' || !userContext.username) {
    return json({ ok: false, reason: '请先登录。' }, 401);
  }

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: '请求格式不正确。' }, 400);
  }

  const { currentPassword, newPassword } = body;
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return json({ ok: false, reason: '请填写当前密码和新密码。' }, 400);
  }

  const result = await accountService.changePassword(userContext.username, currentPassword, newPassword);
  if (!result.ok) {
    return json(result, 400);
  }
  return json({ ok: true });
};
