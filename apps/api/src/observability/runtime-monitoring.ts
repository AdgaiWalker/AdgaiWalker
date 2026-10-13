import { ConsoleLogger, type INestApplication, type LoggerService } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestIdMiddleware } from './request-id.middleware';
import { RuntimeTeeLogger } from './runtime-tee-logger';
import {
  RUNTIME_LOG_BUFFER,
  RUNTIME_REQUEST_BUFFER,
  type RuntimeLogBufferPort,
  type RuntimeRequestBufferPort,
} from '../ports/runtime-monitor.port';

/**
 * 安装本地运行监控的采集侧（生产启动与集成测共用同一份接线）。
 *
 * 为什么抽成一个函数：接线有两处就一定会漂移——main.ts 接了、集成测没接，
 * 于是"测试通过但线上没数据"。这里让两边跑同一段代码，测试才具备证明力。
 *
 * 顺序有讲究：**必须在 restore gate 注册之后调用**。gate 拦截时先响应，
 * 那时 requestId 还没轮到；倒过来会让 gate 的 503 也带上 request id，
 * 属于无人要求的行为变化。
 *
 * 采集全程 fail-open：缓冲区坏了、写满了，业务照跑（与后台日志 fail-closed 相反）。
 */
export function installRuntimeMonitoring(
  app: INestApplication,
  options: { inner?: LoggerService } = {},
): void {
  const logBuffer = app.get<RuntimeLogBufferPort>(RUNTIME_LOG_BUFFER);
  const requestBuffer = app.get<RuntimeRequestBufferPort>(RUNTIME_REQUEST_BUFFER);
  // 终端照旧打印（inner），另外留一份可查的进程内副本
  app.useLogger(new RuntimeTeeLogger(options.inner ?? new ConsoleLogger(), logBuffer));
  const requestId = new RequestIdMiddleware(requestBuffer);
  app.use((req: Request, res: Response, next: NextFunction) => requestId.use(req, res, next));
}
