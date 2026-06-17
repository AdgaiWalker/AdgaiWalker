/**
 * POST /api/auth/login — 用户名密码登录（用户 + owner 同入口）
 *
 * body: { username, password }
 * 成功 → 200 { ok:true, username } + Set-Cookie walker-session
 * 失败 → 401 { ok:false, reason }（统一"用户名或密码错误"，防枚举）
 */
import type { APIRoute } from 'astro';

import { createAccountService } from '@/services/account.service';
import { sessionCookie, signSessionToken } from '@/lib/account-auth';
import { getClientIP, rateLimit } from '@/lib/rate-limit';

const accountService = createAccountService();

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(headers ?? {}) },
  });
}

export const POST: APIRoute = async ({ request }) => {
  // 限流：每 IP 每分钟 10 次，防暴力破解
  const ipRL = await rateLimit(`auth:login:${getClientIP(request)}`, { windowMs: 60_000, max: 10 });
  if (!ipRL.allowed) return json({ ok: false, reason: '尝试太频繁，请稍后再试。' }, 429);

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: '请求格式不正确。' }, 400);
  }

  const { username, password } = body;
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return json({ ok: false, reason: '请输入用户名和密码。' }, 400);
  }

  const result = await accountService.login(username, password);
  if (!result.ok || !result.sessionId || !result.role) {
    return json({ ok: false, reason: result.reason ?? '登录失败。' }, 401);
  }

  let token: string;
  try {
    token = signSessionToken({ sid: result.sessionId, role: result.role, iat: Math.floor(Date.now() / 1000) });
  } catch {
    return json({ ok: false, reason: '服务端会话签名未配置（COOKIE_SECRET）' }, 500);
  }
  return json({ ok: true, username: result.username }, 200, { 'Set-Cookie': sessionCookie(token) });
};
