import { timingSafeEqual } from 'node:crypto';

import type { APIRoute } from 'astro';
import { signToken, authCookie, clearCookie, verifyToken } from '@/lib/admin-auth';

const COOKIE_NAME = 'walker-admin';

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(headers ?? {}),
    },
  });
}

function constantTimeStringEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export const GET: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.split(';').find(c => c.trim().startsWith(`${COOKIE_NAME}=`));
  const token = match?.split('=')[1]?.trim();
  const admin = Boolean(token && verifyToken(token));

  return json({ admin });
};

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.ADMIN_PASSWORD;
  if (!secret) return json({ error: '管理功能未配置。' }, 503);

  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误。' }, 400);
  }

  const { password } = body;
  if (typeof password !== 'string' || password.length === 0) {
    return json({ error: '请输入密码。' }, 400);
  }

  if (!constantTimeStringEqual(password, secret)) {
    return json({ error: '密码错误。' }, 401);
  }

  const token = signToken({ sub: 'admin', iat: Math.floor(Date.now() / 1000) });
  return json({ ok: true }, 200, { 'Set-Cookie': authCookie(token) });
};

export const DELETE: APIRoute = async () => {
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
};
