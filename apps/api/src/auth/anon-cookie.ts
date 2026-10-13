import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';

const COOKIE_NAME = 'walker-anon';
const MAX_AGE_SEC = 2_592_000; // 30 天
/** cookie 值：32 字节随机 hex。bearer token 形态，伪造值不会命中任何已登记的服务端 hash。 */
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/**
 * HTTP 层：解析或签发游客匿名 cookie（HttpOnly + SameSite=Lax + Secure）。
 * cookie 是 bearer token；服务端只存它的 sha256（见 hashAnonId），
 * 任意注入的 ID 不会命中他人记录——fail-closed 视为新访客。
 * 不含业务规则（配额在 GuestQuotaPort）。
 */
export function resolveOrSetAnonId(
  cookieHeader: string | undefined,
  res: Response,
): string {
  const match = cookieHeader?.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`),
  );
  if (match?.[1]) {
    const value = decodeURIComponent(match[1]);
    if (TOKEN_PATTERN.test(value)) return value;
    // 形状不符的值（含旧 UUID 与伪造串）一律重签，不沿用注入值
  }
  const id = randomBytes(32).toString('hex');
  const secure = process.env.WALKER_ANON_COOKIE_SECURE === '0' ? '' : '; Secure';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${id}; Path=/; Max-Age=${MAX_AGE_SEC}; SameSite=Lax; HttpOnly${secure}`,
  );
  return id;
}

/** 匿名身份的服务端存储形态：sha256。明文 token 只在 HTTP 层存在，不落库。 */
export function hashAnonId(anonId: string): string {
  return createHash('sha256').update(anonId).digest('hex');
}

export function extractClientIpKey(req: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const fromHeader = raw?.split(',')[0]?.trim();
  return fromHeader || req.socket?.remoteAddress || 'unknown';
}
