/**
 * POST /api/auth/register — 邀请码门控注册
 *
 * body: { inviteCode, username, password, personaAnchor? }
 * 成功 → 200 { ok:true, username } + Set-Cookie walker-session
 * 失败 → 400 { ok:false, reason }
 */
import type { APIRoute } from 'astro';

import { createAccountService } from '@/services/account.service';
import { sessionCookie, signSessionToken } from '@/lib/account-auth';
import { getClientIP, rateLimit } from '@/lib/rate-limit';
import type { RegisterInput } from '@/services/interfaces';

const accountService = createAccountService();

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(headers ?? {}) },
  });
}

export const POST: APIRoute = async ({ request }) => {
  // 限流：每 IP 每分钟 5 次，防邀请码暴力枚举
  const ipRL = await rateLimit(`auth:register:${getClientIP(request)}`, { windowMs: 60_000, max: 5 });
  if (!ipRL.allowed) return json({ ok: false, reason: '尝试太频繁，请稍后再试。' }, 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: '请求格式不正确。' }, 400);
  }
  const d = body as Record<string, unknown>;
  const input: RegisterInput = {
    inviteCode: typeof d.inviteCode === 'string' ? d.inviteCode : '',
    username: typeof d.username === 'string' ? d.username : '',
    password: typeof d.password === 'string' ? d.password : '',
    personaAnchor: typeof d.personaAnchor === 'string' ? d.personaAnchor : undefined,
  };
  if (!input.inviteCode || !input.username || !input.password) {
    return json({ ok: false, reason: '请填写邀请码、用户名和密码。' }, 400);
  }

  const result = await accountService.register(input);
  if (!result.ok || !result.sessionId || !result.role) {
    return json({ ok: false, reason: result.reason ?? '注册失败。' }, 400);
  }

  const token = signSessionToken({ sid: result.sessionId, role: result.role, iat: Math.floor(Date.now() / 1000) });
  return json({ ok: true, username: result.username }, 200, { 'Set-Cookie': sessionCookie(token) });
};
