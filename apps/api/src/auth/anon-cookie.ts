import { randomUUID } from 'node:crypto';
import type { Response } from 'express';

const COOKIE_NAME = 'walker-anon';
const MAX_AGE_SEC = 2_592_000; // 30 天

/**
 * HTTP 层：解析或签发游客匿名 cookie。
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
    return decodeURIComponent(match[1]);
  }
  const id = randomUUID();
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(id)}; Path=/; Max-Age=${MAX_AGE_SEC}; SameSite=Lax; HttpOnly`,
  );
  return id;
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
