import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { routeTemplate } from '@walker/shared';
import {
  ADMIN_BACKGROUND_POLL_HEADER,
  isBackgroundAdminRequest,
} from '../auth/admin-background-request';
import type { RuntimeRequestBufferPort } from '../ports/runtime-monitor.port';

/**
 * 为每个请求注入 requestId、回写响应头、结构化日志（终端），并登记进进程内请求指标缓冲。
 *
 * 三条边界：
 * - **观测故障不得拖垮主请求**：写侧是 fail-open 实现，这里再套一层 try/catch。
 * - **只记路由模板，不记 query**（2026-10-12 口径修正）：原先写 req.url，会把
 *   ?token=... 这类查询串带进日志与界面；现在写 Express 的 route 模式，
 *   匹配不到路由写 [unmatched]，绝不退回原始 URL。
 * - **一次请求只登记一次**：finish 与 close 都挂上并共用守卫。前端切换会话 / 卸载组件时
 *   会 abort 轮询，那种情况记 interrupted —— 既不算成功也不算失败（否则成功率会写成谎话），
 *   但必须记，否则"进行中"计数会永久残留。
 */
export class RequestIdMiddleware {
  constructor(private readonly metrics?: RuntimeRequestBufferPort) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    const requestId =
      incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
    res.setHeader('x-request-id', requestId);
    (req as Request & { requestId?: string }).requestId = requestId;
    const started = Date.now();
    // 「这次请求是不是自动的」用与后台日志同一份判据（auth/admin-background-request.ts）：
    // 界面上的「只看人工操作」与「自动」标记都靠它，两处各写一遍必然分叉。
    const background = isBackgroundAdminRequest({
      marker: req.header(ADMIN_BACKGROUND_POLL_HEADER),
      method: req.method,
      path: req.path,
    });
    try {
      this.metrics?.begin();
    } catch {
      // fail-open
    }

    let settled = false;
    const settle = (completedByServer: boolean): void => {
      if (settled) return;
      settled = true;
      const status = res.statusCode;
      const durationMs = Date.now() - started;
      const route = routeTemplate(
        req.baseUrl,
        typeof req.route?.path === 'string' ? req.route.path : undefined,
      );
      try {
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({
            level: status >= 500 ? 'error' : 'info',
            msg: 'http_request',
            requestId,
            method: req.method,
            route,
            status,
            ms: durationMs,
            interrupted: !completedByServer,
          }),
        );
      } catch {
        // 日志失败忽略
      }
      try {
        this.metrics?.finish({
          ts: new Date(),
          method: req.method,
          route,
          status,
          durationMs,
          requestId,
          background,
          ...(completedByServer ? {} : { outcome: 'interrupted' as const }),
        });
      } catch {
        // fail-open：观测失败不影响业务结果
      }
    };

    res.on('finish', () => settle(true));
    // 未正常收尾就 close：连接被掐断，记 interrupted
    res.on('close', () => settle(res.writableEnded));
    next();
  }
}
