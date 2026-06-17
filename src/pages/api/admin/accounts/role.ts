/**
 * POST /api/admin/accounts/role — 站主指派角色（仅 owner）
 *
 * body: { username, role: 'user' | 'admin' | 'owner' }
 * 不能改自己的角色（防站主把自己降级后无人能指派）。
 */
import type { APIRoute } from 'astro';

import { isOwner } from '@/lib/admin-auth';
import { readSessionId } from '@/lib/account-auth';
import { createAccountService } from '@/services/account.service';
import { createUserContextService } from '@/services/user-context.service';
import { createAccountStore } from '@/stores/account.store';
import { createSessionStore } from '@/stores/session.store';
import { createUserProfileStore } from '@/stores/user-profile.store';
import type { AccountRole } from '@/stores/ports';

const accountService = createAccountService();
const userContextService = createUserContextService({
  sessionStore: createSessionStore(),
  accountStore: createAccountStore(),
  profileStore: createUserProfileStore(),
});

const VALID_ROLES: AccountRole[] = ['user', 'admin', 'owner'];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!isOwner(request)) {
    return json({ ok: false, reason: '仅站主可指派角色。' }, 403);
  }

  // 当前用户名（防自改角色）
  const me = await userContextService.resolve({ sessionId: readSessionId(request), isAdmin: false });
  const myUsername = me.username;

  let body: { username?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: '请求格式不正确。' }, 400);
  }

  const { username, role } = body;
  if (typeof username !== 'string' || !username) {
    return json({ ok: false, reason: '请指定用户名。' }, 400);
  }
  if (!VALID_ROLES.includes(role as AccountRole)) {
    return json({ ok: false, reason: 'role 必须是 user / admin / owner。' }, 400);
  }
  if (myUsername && username === myUsername) {
    return json({ ok: false, reason: '不能修改自己的角色。' }, 400);
  }

  const result = await accountService.setRole(username, role as AccountRole);
  if (!result.ok) return json(result, 400);
  return json({ ok: true });
};
