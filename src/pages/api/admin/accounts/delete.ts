/**
 * POST /api/admin/accounts/delete — 删账号（仅 owner，不能删自己）
 *
 * body: { username }。级联：撤销会话 + 删画像 + 需求脱敏 + 删账号。
 */
import type { APIRoute } from 'astro';

import { isOwner } from '@/lib/admin-auth';
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
  if (!isOwner(request)) {
    return json({ ok: false, reason: '仅站主可删账号。' }, 403);
  }

  const me = await userContextService.resolve({ sessionId: readSessionId(request), isAdmin: false });

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
  if (me.username && username === me.username) {
    return json({ ok: false, reason: '不能删除自己。' }, 400);
  }

  const result = await accountService.deleteAccount(username);
  if (!result.ok) return json(result, 400);
  return json({ ok: true });
};
