/**
 * POST /api/auth/setup — owner 账号一次性 bootstrap
 *
 * 仅当系统无账号时，凭 ADMIN_PASSWORD 建 owner 账号（role=admin）。
 * body: { adminPassword, ownerUsername, ownerPassword }
 * 成功 → 200 { ok:true, username } + Set-Cookie（已登录 owner）
 * 之后该端点自锁（系统已有账号 → 拒绝）。
 */
import type { APIRoute } from 'astro';

import { createAccountService } from '@/services/account.service';
import { sessionCookie, signSessionToken } from '@/lib/account-auth';

const accountService = createAccountService();

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(headers ?? {}) },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let body: { adminPassword?: unknown; ownerUsername?: unknown; ownerPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: '请求格式不正确。' }, 400);
  }

  const { adminPassword, ownerUsername, ownerPassword } = body;
  if (typeof adminPassword !== 'string' || typeof ownerUsername !== 'string' || typeof ownerPassword !== 'string') {
    return json({ ok: false, reason: '请填写 bootstrap 密钥、用户名和密码。' }, 400);
  }

  const result = await accountService.bootstrapOwner(adminPassword, ownerUsername, ownerPassword);
  if (!result.ok || !result.sessionId || !result.role) {
    // 系统已有账号 → 410（自锁）；其它失败 → 400
    const status = result.code === 'bootstrap-locked' ? 410 : 400;
    return json({ ok: false, reason: result.reason ?? 'bootstrap 失败。' }, status);
  }

  let token: string;
  try {
    token = signSessionToken({ sid: result.sessionId, role: result.role, iat: Math.floor(Date.now() / 1000) });
  } catch {
    return json({ ok: false, reason: '服务端会话签名未配置（COOKIE_SECRET）' }, 500);
  }
  return json({ ok: true, username: result.username }, 200, { 'Set-Cookie': sessionCookie(token) });
};
