/**
 * POST /api/auth/logout — 登出当前会话
 *
 * 撤销会话 + 清除 walker-session cookie。
 */
import type { APIRoute } from 'astro';

import { clearSessionCookie, readSessionId } from '@/lib/account-auth';
import { createAccountService } from '@/services/account.service';

const accountService = createAccountService();

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(headers ?? {}) },
  });
}

export const POST: APIRoute = async ({ request }) => {
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
