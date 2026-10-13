import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ADMIN_REQUEST_LOG, type AdminRequestLogPort } from '../ports/admin-request-log.port';
import { ADMIN_BACKGROUND_POLL_HEADER, isBackgroundAdminRequest } from './admin-background-request';

/** Records the HTTP step, never its URL query, headers, body or response. */
@Injectable()
export class AdminRequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AdminRequestLogMiddleware.name);
  constructor(@Inject(ADMIN_REQUEST_LOG) private readonly log: AdminRequestLogPort) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Background refreshes are transport housekeeping, not owner actions.
    // Never trust the marker for a mutating route; preflight is a read-only POST.
    // 判据与运行监控共用一份实现（auth/admin-background-request.ts）。
    if (
      isBackgroundAdminRequest({
        marker: req.header(ADMIN_BACKGROUND_POLL_HEADER),
        method: req.method,
        path: req.path,
      })
    ) {
      next();
      return;
    }
    const id = randomUUID();
    const started = performance.now();
    try {
      // A durable STARTED row exists before the handler runs. A crashed process
      // leaves an honest unfinished attempt rather than inventing a success.
      await this.log.begin({ id, actor: process.env.WALKER_ADMIN_TOKEN ? 'owner' : 'local-dev', method: req.method, path: '[pending]' });
    } catch (error) {
      this.logger.error('Cannot start admin request log', error instanceof Error ? error.stack : String(error));
      res.status(503).json({ code: 'admin-log-unavailable', message: '后台日志不可写，操作未执行' });
      return;
    }
    res.once('finish', () => {
      const route = req.route?.path;
      // Express route patterns contain parameter names, never their values.
      const path = typeof route === 'string' ? `${req.baseUrl}${route}` : '[unmatched]';
      void this.log.finish(id, path, res.statusCode, Math.max(0, Math.round(performance.now() - started)))
        .catch((error: unknown) => this.logger.error('Cannot finish admin request log', error instanceof Error ? error.stack : String(error)));
    });
    next();
  }
}
