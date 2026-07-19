/**
 * 账号会话认证 — 统一会话 Cookie（walker-session）
 *
 * 登录/注册成功后签发 HMAC 签名 Cookie，cookie 只装 {sid, role, iat}；
 * 真正会话有效性查 SessionRepositoryPort。
 *
 * 密钥走 COOKIE_SECRET（独立于 ADMIN_PASSWORD）；未配置时：
 *   - signSessionToken 抛错（登录/注册需要密钥，强约束配置）
 *   - verifySessionToken 返回 null（admin gate 判定降级为非管理员，不崩）
 * admin 与 user 同一种会话，role 写在 session 记录 + cookie payload 里，
 * 使 isAdmin() 能纯 cookie 同步判定（无需 Redis 查询）。
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'walker-session';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 天

export type SessionRole = 'user' | 'admin' | 'owner';

function getSecret(): string {
  const configured = import.meta.env.COOKIE_SECRET ?? '';
  if (configured) return configured;
  // 本机开发预览需要可签名的临时会话；生产环境仍强制配置 COOKIE_SECRET。
  return import.meta.env.DEV ? 'walker-local-preview-session-only' : '';
}

export function createSessionId(): string {
  return randomUUID();
}

/** 签发会话 token（HMAC-SHA256，密钥 COOKIE_SECRET） */
export function signSessionToken(payload: { sid: string; role: SessionRole; iat: number }): string {
  const secret = getSecret();
  if (!secret) throw new Error('COOKIE_SECRET 未配置');
  const data = JSON.stringify(payload);
  const sig = createHmac('sha256', secret).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ ...payload, sig })).toString('base64url');
}

/** 验证会话 token；密钥未配或签名/过期失败返回 null */
export function verifySessionToken(token: string): { sid: string; role: SessionRole; iat: number } | null {
  const secret = getSecret();
  if (!secret) return null;
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
    const { sig, ...payload } = decoded;
    if (!sig || !payload.sid || !payload.role || !payload.iat) return null;
    if (Date.now() / 1000 - payload.iat > SESSION_MAX_AGE) return null;
    const expected = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return { sid: payload.sid, role: payload.role, iat: payload.iat };
  } catch {
    return null;
  }
}

/** 从 Request cookie 中读取 sessionId（已校验签名，未校验会话有效性） */
export function readSessionId(request: Request): string | null {
  return readSessionPayload(request)?.sid ?? null;
}

/** 从 Request cookie 中读取 {sid, role}（已校验签名） */
export function readSessionPayload(request: Request): { sid: string; role: SessionRole } | null {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.split(';').find(c => c.trim().startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const token = match.split('=')[1]?.trim();
  if (!token) return null;
  const payload = verifySessionToken(token);
  return payload ? { sid: payload.sid, role: payload.role } : null;
}

/** 创建登录/注册成功后的 Set-Cookie header */
export function sessionCookie(token: string): string {
  const secure = import.meta.env.PROD ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
}

/** 创建登出的 Set-Cookie header（立即过期） */
export function clearSessionCookie(): string {
  const secure = import.meta.env.PROD ? '; Secure' : '';
  return `${COOKIE_NAME}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
