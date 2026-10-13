import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** 解析允许的来源主机集合：WALKER_PUBLIC_ORIGINS 逗号分隔（生产配 www.iwalk.pro 等）。 */
export function allowedOriginHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.WALKER_PUBLIC_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 所有变更请求的同源校验（CSRF 防线）：
 * - 无 Origin/Referer（curl、同源表单之外的非浏览器客户端）放行；
 * - Origin/Referer 的 host 与请求 Host 相同（同源）或在白名单内放行；
 * - 其余跨站来源一律 403。cookie 是 SameSite=Lax，叠加这层后跨站带 cookie 的写请求被双保险拒绝。
 */
@Injectable()
export class SameOriginMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) return next();
    const header = req.headers.origin ?? req.headers.referer;
    if (!header) return next();
    const value = Array.isArray(header) ? header[0] : header;
    try {
      const originHost = new URL(value).host;
      if (originHost === req.headers.host || allowedOriginHosts().includes(originHost)) return next();
    } catch {
      /* 非法 Origin 一律拒绝 */
    }
    res.status(403).json({ code: 'origin-denied', message: '跨站请求被拒绝' });
  }
}
