/**
 * GET/POST /api/profile — 当前账号画像
 *
 * 登录用户可读写自己的画像；admin GET 返回 authState 供前端放行。
 * 画像字段全部可选，按账号 username 存取。
 */

import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { readSessionId } from '@/lib/account-auth';
import { createUserContextService } from '@/services/user-context.service';
import { createUserProfileService, PersonaAnchorPiiError } from '@/services/profile.service';
import type { ProfileInput } from '@/services/interfaces';
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

const PROFILE_STRING_FIELDS: (keyof ProfileInput)[] = [
  'personaAnchor', 'nickname',
];
const MAX_FIELD_LENGTH = 200;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function validateProfileInput(body: unknown): ProfileInput | null {
  if (!body || typeof body !== 'object') return null;
  const d = body as Record<string, unknown>;
  const result: ProfileInput = {};
  for (const field of PROFILE_STRING_FIELDS) {
    const v = d[field];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' || v.length > MAX_FIELD_LENGTH) return null;
    const trimmed = v.trim();
    result[field] = trimmed || undefined;
  }
  return result;
}

export const GET: APIRoute = async ({ request }) => {
  const userContext = await userContextService.resolve({
    sessionId: readSessionId(request),
    isAdmin: isAdmin(request),
  });

  if (userContext.authState === 'admin') {
    return json({ authState: 'admin', profile: null });
  }
  if (userContext.authState !== 'user' || !userContext.username) {
    return json({ error: '请先登录。' }, 401);
  }
  return json({ authState: 'user', profile: userContext.profile });
};

export const POST: APIRoute = async ({ request }) => {
  const userContext = await userContextService.resolve({
    sessionId: readSessionId(request),
    isAdmin: isAdmin(request),
  });

  if (userContext.authState !== 'user' || !userContext.username) {
    return json({ error: '请先登录。' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式不正确。' }, 400);
  }

  const input = validateProfileInput(body);
  if (!input) {
    return json({ error: '画像字段格式不正确。' }, 400);
  }

  try {
    const profile = await profileService.upsert(userContext.username, input);
    return json({ profile });
  } catch (e) {
    if (e instanceof PersonaAnchorPiiError) {
      return json({ error: '锚点含敏感信息（手机号/邮箱等），请重新填写。' }, 400);
    }
    throw e;
  }
};
