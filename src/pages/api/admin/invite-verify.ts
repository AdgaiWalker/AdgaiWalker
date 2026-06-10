/**
 * POST /api/admin/invite-verify — 邀请码验证接口
 *
 * 接收邀请码，验证后返回是否准入。
 * 管理员可直接跳过验证（已有 cookie 认证）。
 */

import type { APIRoute } from 'astro';
import { isAdmin } from '@/lib/admin-auth';
import { createInviteService } from '@/services/invite.service';
import { createInviteCodeStore } from '@/stores/invite-code.store';

const inviteService = createInviteService({
  inviteCodeStore: createInviteCodeStore(),
});

function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(headers ?? {}),
    },
  });
}

export const POST: APIRoute = async ({ request }) => {
  // 管理员直接放行
  if (isAdmin(request)) {
    return json({ admitted: true, reason: '管理员身份。' });
  }

  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ admitted: false, reason: '请求格式不正确。' }, 400);
  }

  const { code } = body;
  if (typeof code !== 'string' || code.length === 0) {
    return json({ admitted: false, reason: '请输入邀请码。' }, 400);
  }

  const result = await inviteService.verifyAndAdmit(code);
  if (!result.admitted) {
    return json({ admitted: false, reason: result.reason }, 403);
  }

  return json({ admitted: true, code: result.code });
};
