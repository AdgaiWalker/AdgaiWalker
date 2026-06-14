/**
 * POST /api/invite/verify — 公开邀请码验证入口
 *
 * 验证邀请码；成功后建立 invited session 并通过 Set-Cookie 下发签名 token。
 * 管理员 cookie 直接放行（不建立 invited session）。
 */

import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { invitedCookie, signInvitedToken } from '@/lib/invited-session-auth';
import { createInviteAccessService } from '@/services/invite-access.service';
import { createUserProfileService, PersonaAnchorPiiError } from '@/services/profile.service';
import { createInviteCodeStore } from '@/stores/invite-code.store';
import { createInvitedSessionStore } from '@/stores/invited-session.store';
import { createUserProfileStore } from '@/stores/user-profile.store';

const inviteAccessService = createInviteAccessService({
  inviteCodeStore: createInviteCodeStore(),
  sessionStore: createInvitedSessionStore(),
});
const profileService = createUserProfileService({ profileStore: createUserProfileStore() });

function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(headers ?? {}) },
  });
}

export const POST: APIRoute = async ({ request }) => {
  // 管理员直接放行
  if (isAdmin(request)) {
    return json({ admitted: true, reason: '管理员身份。' });
  }

  let body: { code?: unknown; personaAnchor?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ admitted: false, reason: '请求格式不正确。' }, 400);
  }

  const { code, personaAnchor } = body;
  if (typeof code !== 'string' || code.length === 0) {
    return json({ admitted: false, reason: '请输入邀请码。' }, 400);
  }
  const anchor = typeof personaAnchor === 'string' ? personaAnchor.trim() : undefined;

  const result = await inviteAccessService.verifyAndAdmit(code);
  if (!result.admitted || !result.sessionId) {
    return json({ admitted: false, reason: result.reason }, 403);
  }

  // 带锚点则存画像（PII 检测在 service 层，命中返回 400；其他保存失败不阻断准入）
  if (anchor) {
    try {
      await profileService.upsert(result.sessionId, { personaAnchor: anchor });
    } catch (e) {
      if (e instanceof PersonaAnchorPiiError) {
        return json({ admitted: false, reason: '锚点含敏感信息（手机号/邮箱等），请重新填写。' }, 400);
      }
    }
  }

  const token = signInvitedToken({
    sid: result.sessionId,
    iat: Math.floor(Date.now() / 1000),
  });

  return json(
    { admitted: true, sessionId: result.sessionId },
    200,
    { 'Set-Cookie': invitedCookie(token) },
  );
};
