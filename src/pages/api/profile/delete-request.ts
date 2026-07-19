/**
 * POST /api/profile/delete-request — 用户请求删除画像（账号级）
 *
 * 标记当前账号画像为待删除（deleteRequestedAt），并级联脱敏该用户所有 NeedCase。
 * 第一版不做即时物理删除，只做软删除标记 + 关联脱敏，供管理员后续清理。
 */

import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { readSessionId } from '@/lib/account-auth';
import { createUserProfileService } from '@/services/profile.service';
import { createUserContextService } from '@/services/user-context.service';
import { createAccountStore } from '@/stores/account.store';
import { createSessionStore } from '@/stores/session.store';
import { createUserProfileStore } from '@/stores/user-profile.store';

const profileStore = createUserProfileStore();
const profileService = createUserProfileService({ profileStore });
const userContextService = createUserContextService({
  sessionStore: createSessionStore(),
  accountStore: createAccountStore(),
  profileStore,
});

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

  const userContext = await userContextService.resolve({
    sessionId: readSessionId(request),
    isAdmin: false,
  });
  if (userContext.authState !== 'user' || !userContext.username) {
    return json({ error: '请先登录。' }, 401);
  }

  try {
    await profileService.requestDeletion(userContext.username);
    return json({ ok: true });
  } catch {
    return json({ error: '删除请求失败，请稍后重试。' }, 500);
  }
};
