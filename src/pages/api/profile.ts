/**
 * GET/POST /api/profile — 当前会话画像
 *
 * invited 用户可读写自己的画像；admin cookie 不走画像（直接 401 引导走后台）。
 * 画像字段全部可选，contact 自动脱敏。
 */

import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { readInvitedSessionId } from '@/lib/invited-session-auth';
import { createUserProfileService, PersonaAnchorPiiError } from '@/services/profile.service';
import type { ProfileInput } from '@/services/interfaces';
import { createUserProfileStore } from '@/stores/user-profile.store';

const profileService = createUserProfileService({ profileStore: createUserProfileStore() });

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

function resolveInvitedSessionId(request: Request): string | null {
  if (isAdmin(request)) return null;
  return readInvitedSessionId(request);
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
  const sessionId = resolveInvitedSessionId(request);
  if (!sessionId) {
    return json({ error: '请先通过邀请码验证。' }, 401);
  }
  const profile = await profileService.get(sessionId);
  return json({ profile });
};

export const POST: APIRoute = async ({ request }) => {
  const sessionId = resolveInvitedSessionId(request);
  if (!sessionId) {
    return json({ error: '请先通过邀请码验证。' }, 401);
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
    const profile = await profileService.upsert(sessionId, input);
    return json({ profile });
  } catch (e) {
    if (e instanceof PersonaAnchorPiiError) {
      return json({ error: '锚点含敏感信息（手机号/邮箱等），请重新填写。' }, 400);
    }
    throw e;
  }
};
