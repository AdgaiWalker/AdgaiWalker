/**
 * POST /api/profile/delete-request — 用户请求删除画像
 *
 * 标记当前会话画像为待删除（deleteRequestedAt），供管理员后续清理。
 * 第一版不做即时物理删除，只做软删除标记 + 关联需求事件脱敏由管理员处理。
 */

import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { readInvitedSessionId } from '@/lib/invited-session-auth';
import { createUserProfileService } from '@/services/profile.service';
import { createUserProfileStore } from '@/stores/user-profile.store';

const profileService = createUserProfileService({ profileStore: createUserProfileStore() });

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (isAdmin(request)) {
    return json({ error: '管理员请使用后台管理画像。' }, 400);
  }

  const sessionId = readInvitedSessionId(request);
  if (!sessionId) {
    return json({ error: '请先通过邀请码验证。' }, 401);
  }

  try {
    await profileService.requestDeletion(sessionId);
    return json({ ok: true });
  } catch {
    return json({ error: '删除请求失败，请稍后重试。' }, 500);
  }
};
