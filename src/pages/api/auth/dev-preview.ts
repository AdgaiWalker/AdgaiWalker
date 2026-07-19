/**
 * POST /api/auth/dev-preview — 仅本机开发环境使用的后台预览会话。
 *
 * 不创建账号、不写入数据库、不在生产构建启用。用于设计和开发阶段直接查看后台。
 */
import type { APIRoute } from 'astro';

import { createSessionId, sessionCookie, signSessionToken } from '@/lib/account-auth';
import { createSessionStore } from '@/stores/session.store';

const sessionStore = createSessionStore();

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(headers ?? {}) },
  });
}

function isLoopback(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1';
}

export const POST: APIRoute = async ({ request }) => {
  if (!import.meta.env.DEV || !isLoopback(request)) {
    return json({ ok: false, reason: '此入口仅在本机开发环境可用。' }, 404);
  }

  const sid = `local-preview:${createSessionId()}`;
  const now = new Date();
  await sessionStore.create({
    sessionId: sid,
    username: 'local-preview',
    role: 'owner',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  });

  const token = signSessionToken({
    sid,
    role: 'owner',
    iat: Math.floor(Date.now() / 1000),
  });

  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token) });
};
