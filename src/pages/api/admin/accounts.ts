/**
 * GET /api/admin/accounts — 账号列表（admin）
 *
 * 返回所有注册账号（不含 passwordHash）。
 */
import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { createAccountService } from '@/services/account.service';

const accountService = createAccountService();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) {
    return json({ error: '未授权。' }, 401);
  }
  const accounts = await accountService.listAccounts();
  return json({
    accounts: accounts.map(a => ({
      username: a.username,
      role: a.role,
      status: a.status,
      createdAt: a.createdAt,
      lastLoginAt: a.lastLoginAt,
      inviteCodeHash: a.inviteCodeHash,
    })),
  });
};
