/**
 * POST /api/admin/accounts/delete — 删账号（仅 owner，不能删自己）
 *
 * body: { username }。级联：撤销会话 + 删画像 + 需求脱敏 + 删账号。
 */
import type { APIRoute } from 'astro';

import { isOwnerAsync } from '@/lib/admin-auth';
import { captureException } from '@/lib/sentry';
import { readSessionId } from '@/lib/account-auth';
import { requireHighRiskAudit } from '@/lib/admin-audit';
import { resolveAdminActor } from '@/lib/admin-actor';
import { createAccountService } from '@/services/account.service';
import { createUserContextService } from '@/services/user-context.service';
import { createAccountStore } from '@/stores/account.store';
import { createSessionStore } from '@/stores/session.store';
import { createUserProfileStore } from '@/stores/user-profile.store';

const sessionStore = createSessionStore();
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
  if (!await isOwnerAsync(request, sessionStore)) {
    return json({ ok: false, reason: '仅站主可删账号。' }, 403);
  }

  const me = await userContextService.resolve({ sessionId: readSessionId(request), isAdmin: false });

  let body: { username?: unknown };
  try {
    body = await request.json();
  } catch (error) {
    captureException(error, { action: 'account.delete' });
    return json({ ok: false, reason: '请求格式不正确。' }, 400);
  }

  const { username } = body;
  if (typeof username !== 'string' || !username) {
    return json({ ok: false, reason: '请指定用户名。' }, 400);
  }
  if (me.username && username === me.username) {
    return json({ ok: false, reason: '不能删除自己。' }, 400);
  }

  const actor = await resolveAdminActor(request);
  const audit = await requireHighRiskAudit({
    actor,
    action: 'account.delete',
    targetType: 'account',
    targetId: username,
    reason: '删除账号会撤销会话、删除画像、脱敏需求并删除账号。',
  });
  if (!audit.ok) return json({ ok: false, reason: audit.reason, code: audit.code }, audit.status);

  const result = await accountService.deleteAccount(username);
  if (!result.ok) return json(result, 400);
  return json({ ok: true });
};
