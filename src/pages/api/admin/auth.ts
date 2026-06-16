/**
 * /api/admin/auth — admin 状态查询 + 登出
 *
 * 站主现在是一个 role=admin 的账号，登录走 /api/auth/login（账号会话）。
 * 本端点保留：
 *   GET    — 查询当前请求是否为站主（读 walker-session cookie + role=admin，无 Redis）
 *   DELETE — 登出（撤销当前会话 + 清 cookie）
 * 旧的 POST 密码登录已退役（owner 登录走 /login → /api/auth/login）。
 */

import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { clearSessionCookie, readSessionId } from '@/lib/account-auth';
import { createAccountService } from '@/services/account.service';

const accountService = createAccountService();

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(headers ?? {}),
    },
  });
}

export const GET: APIRoute = async ({ request }) => {
  return json({ admin: isAdmin(request) });
};

export const DELETE: APIRoute = async ({ request }) => {
  const sessionId = readSessionId(request);
  if (sessionId) {
    try {
      await accountService.logout(sessionId);
    } catch {
      /* 登出失败仍清 cookie */
    }
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
};
