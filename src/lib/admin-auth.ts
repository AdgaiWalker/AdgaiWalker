/**
 * Admin 认证工具
 *
 * Cookie-based 认证，只有站主（你）一个管理员。
 * 密码存在 ADMIN_PASSWORD 环境变量。
 * 不收集任何用户注册信息。
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'walker-admin';
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 天

function getSecret(): string {
  return import.meta.env.ADMIN_PASSWORD ?? '';
}

/** 签发 token（HMAC-SHA256 签名） */
export function signToken(payload: { sub: string; iat: number }): string {
  const secret = getSecret();
  if (!secret) throw new Error('ADMIN_PASSWORD 未配置');
  const data = JSON.stringify(payload);
  const sig = createHmac('sha256', secret).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ ...payload, sig })).toString('base64url');
}

/** 验证 token */
export function verifyToken(token: string): boolean {
  const secret = getSecret();
  if (!secret) return false;
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
    const { sig, ...payload } = decoded;
    if (!sig || !payload.sub || !payload.iat) return false;
    // Token 有效期 7 天
    if (Date.now() / 1000 - payload.iat > TOKEN_MAX_AGE) return false;
    const expected = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** 从 Request 的 cookie 中检查管理员身份 */
export function isAdmin(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.split(';').find(c => c.trim().startsWith(`${COOKIE_NAME}=`));
  if (!match) return false;
  const token = match.split('=')[1]?.trim();
  if (!token) return false;
  return verifyToken(token);
}

/** 创建登录成功后的 Set-Cookie header */
export function authCookie(token: string): string {
  const secure = import.meta.env.PROD ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=${TOKEN_MAX_AGE}`;
}

/** 创建登出的 Set-Cookie header（立即过期） */
export function clearCookie(): string {
  const secure = import.meta.env.PROD ? '; Secure' : '';
  return `${COOKIE_NAME}=; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=0`;
}
