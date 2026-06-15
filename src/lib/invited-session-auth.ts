/**
 * Invited Session 认证 — 轻量会话 Cookie
 *
 * 邀请码验证通过后签发 HMAC 签名 Cookie，标识 invited 会话。
 * Cookie 只是 sessionId 的载体；真正的会话有效性还要查 InvitedSessionRepositoryPort。
 *
 * 与 admin 认证独立（不同 cookie 名），密钥复用 ADMIN_PASSWORD 避免新增环境变量。
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'walker-invited';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 天

function getSecret(): string {
  // 复用 ADMIN_PASSWORD 作为签名密钥来源，避免新增环境变量
  return import.meta.env.ADMIN_PASSWORD ?? 'walker-invited-default';
}

export function createInvitedSessionId(): string {
  return randomUUID();
}

export function signInvitedToken(payload: { sid: string; iat: number }): string {
  const data = JSON.stringify(payload);
  const sig = createHmac('sha256', getSecret()).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ ...payload, sig })).toString('base64url');
}

export function verifyInvitedToken(token: string): { sid: string; iat: number } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
    const { sig, ...payload } = decoded;
    if (!sig || !payload.sid || !payload.iat) return null;
    if (Date.now() / 1000 - payload.iat > SESSION_MAX_AGE) return null;
    const expected = createHmac('sha256', getSecret()).update(JSON.stringify(payload)).digest('hex');
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return { sid: payload.sid, iat: payload.iat };
  } catch {
    return null;
  }
}

/** 从 Request cookie 中读取 invited sessionId（已校验签名，但未校验会话有效性） */
export function readInvitedSessionId(request: Request): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.split(';').find(c => c.trim().startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const token = match.split('=')[1]?.trim();
  if (!token) return null;
  const payload = verifyInvitedToken(token);
  return payload?.sid ?? null;
}

export function invitedCookie(token: string): string {
  const secure = import.meta.env.PROD ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearInvitedCookie(): string {
  const secure = import.meta.env.PROD ? '; Secure' : '';
  return `${COOKIE_NAME}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`;
}

export const INVITED_COOKIE_NAME = COOKIE_NAME;
