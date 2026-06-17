/**
 * /api/admin/invite-codes — 后台邀请码管理
 *
 * GET    list（admin+owner 可看）
 * POST   generate { label, count, maxUses }（仅 owner）→ 返回生成的码（仅显示一次）
 * DELETE delete { code }（仅 owner）
 */
import type { APIRoute } from 'astro';

import { isAdmin, isOwner } from '@/lib/admin-auth';
import { readSessionId } from '@/lib/account-auth';
import { createManagedInviteCodeStore } from '@/stores/managed-invite-code.store';
import { createUserContextService } from '@/services/user-context.service';
import { createAccountStore } from '@/stores/account.store';
import { createSessionStore } from '@/stores/session.store';
import { createUserProfileStore } from '@/stores/user-profile.store';

const store = createManagedInviteCodeStore();
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

export const GET: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) return json({ error: '未授权。' }, 401);
  const codes = await store.listAll();
  return json({ codes });
};

export const POST: APIRoute = async ({ request }) => {
  if (!isOwner(request)) return json({ ok: false, reason: '仅站主可生成邀请码。' }, 403);

  const me = await userContextService.resolve({ sessionId: readSessionId(request), isAdmin: false });

  let body: { label?: unknown; count?: unknown; maxUses?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: '请求格式不正确。' }, 400);
  }

  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : '通用';
  const count = Math.max(1, Math.min(Number(body.count) || 1, 500));
  const maxUses = Math.max(1, Number(body.maxUses) || 1);

  const created = await store.generate({ label, count, maxUses, createdBy: me.username ?? 'owner' });
  return json({ ok: true, codes: created.map((c) => c.code) });
};

export const DELETE: APIRoute = async ({ request }) => {
  if (!isOwner(request)) return json({ ok: false, reason: '仅站主可删除邀请码。' }, 403);

  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: '请求格式不正确。' }, 400);
  }

  const code = typeof body.code === 'string' ? body.code : '';
  if (!code) return json({ ok: false, reason: '请指定邀请码。' }, 400);

  await store.delete(code);
  return json({ ok: true });
};
