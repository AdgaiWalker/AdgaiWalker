/**
 * GET /api/admin/accounts/[username] — 单用户详情（admin+owner）
 *
 * 返回账号信息（不含密码哈希）+ 画像 + 在线会话 + 提过的需求（脱敏后摘要）。
 */
import type { APIRoute } from 'astro';

import { isAdminAsync } from '@/lib/admin-auth';
import { createAccountStore } from '@/stores/account.store';
import { createSessionStore } from '@/stores/session.store';
import { createUserProfileStore } from '@/stores/user-profile.store';
import { getNeedCasesByUsername } from '@/stores/need-case.store';

const accountStore = createAccountStore();
const sessionStore = createSessionStore();
const profileStore = createUserProfileStore();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ request, params }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);
  const username = (params.username as string | undefined)?.trim();
  if (!username) return json({ error: '缺少用户名。' }, 400);

  const account = await accountStore.findByUsername(username);
  if (!account) return json({ error: '用户不存在。' }, 404);

  const profile = await profileStore.findByUsername(username);
  const sessions = await sessionStore.listByUsername(username);
  const needCases = await getNeedCasesByUsername(username);

  return json({
    account: {
      username: account.username,
      role: account.role,
      status: account.status,
      createdAt: account.createdAt,
      lastLoginAt: account.lastLoginAt,
      inviteCodeHash: account.inviteCodeHash,
    },
    profile: profile ? { personaAnchor: profile.personaAnchor, nickname: profile.nickname } : null,
    sessions: sessions
      .filter((s) => new Date(s.expiresAt).getTime() > Date.now())
      .map((s) => ({ sessionId: s.sessionId, createdAt: s.createdAt, expiresAt: s.expiresAt })),
    needCases: needCases.map((c) => ({
      needCaseId: c.needCaseId,
      needSummary: c.needSummary,
      feedbackStatus: c.feedbackStatus,
      adminReviewStatus: c.adminReviewStatus,
      createdAt: c.createdAt,
    })),
  });
};
