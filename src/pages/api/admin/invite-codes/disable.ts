/**
 * POST /api/admin/invite-codes/disable — 禁用邀请码（仅 owner）
 * body: { code }
 */
import type { APIRoute } from 'astro';

import { isOwner } from '@/lib/admin-auth';
import { createManagedInviteCodeStore } from '@/stores/managed-invite-code.store';

const store = createManagedInviteCodeStore();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!isOwner(request)) return json({ ok: false, reason: '仅站主可禁用邀请码。' }, 403);

  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: '请求格式不正确。' }, 400);
  }

  const code = typeof body.code === 'string' ? body.code : '';
  if (!code) return json({ ok: false, reason: '请指定邀请码。' }, 400);

  await store.disable(code);
  return json({ ok: true });
};
