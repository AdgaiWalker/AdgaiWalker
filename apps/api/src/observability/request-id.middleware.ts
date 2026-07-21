import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * 为每个请求注入 requestId，回写响应头，结构化日志。
 * 观测故障不得拖垮主请求。
 */
export class RequestIdMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    const requestId =
      incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
    res.setHeader('x-request-id', requestId);
    (req as Request & { requestId?: string }).requestId = requestId;
    const started = Date.now();
    res.on('finish', () => {
      try {
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({
            level: res.statusCode >= 500 ? 'error' : 'info',
            msg: 'http_request',
            requestId,
            method: req.method,
            path: req.url,
            status: res.statusCode,
            ms: Date.now() - started,
          }),
        );
      } catch {
        // 日志失败忽略
      }
    });
    next();
  }
}
