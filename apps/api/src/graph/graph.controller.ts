import { Controller, Get, Inject } from '@nestjs/common';
import { GraphService } from './graph.service';

/**
 * 图谱结构体检（管理侧）。
 * 刻意**不进**公网白名单（app.module.ts exclude 表）：它是站主工具，
 * 走管理凭据防线（AdminTokenMiddleware），因此无需同步 ops/windows/Caddyfile。
 */
@Controller('graph')
export class GraphController {
  constructor(@Inject(GraphService) private readonly graph: GraphService) {}

  /** 孤岛 / 坏链 / 单向链接 / 只靠主题线 / 附件孤岛 */
  @Get('health')
  health() {
    return this.graph.health();
  }
}
