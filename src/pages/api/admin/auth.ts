import type { APIRoute } from 'astro';
import { signToken, authCookie, clearCookie } from '@/lib/admin-auth';

/**
 * POST /api/admin/auth
 * Body: { password: string }
 * 验证密码 → 设置 cookie → 返回结果
 */
export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.ADMIN_PASSWORD;
  if (!secret) {
    return new Response(JSON.stringify({ error: '管理功能未配置' }), { status: 503 });
  }

  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: '请求格式错误' }), { status: 400 });
  }

  const { password } = body;
  if (typeof password !== 'string' || password.length === 0) {
    return new Response(JSON.stringify({ error: '请输入密码' }), { status: 400 });
  }

  // 时机安全的字符串比较
  const a = Buffer.from(password);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response(JSON.stringify({ error: '密码错误' }), { status: 401 });
  }

  const token = signToken({ sub: 'admin', iat: Math.floor(Date.now() / 1000) });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': authCookie(token),
    },
  });
};

/**
 * DELETE /api/admin/auth — 登出
 */
export const DELETE: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookie(),
    },
  });
};

/** 时机安全比较（防时序攻击） */
function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return a.equals(b); // Node.js Buffer.equals 已经是常数时间
}
