import { Controller, Get, Inject } from '@nestjs/common';
import { ArchitectureService } from './architecture.service';

/**
 * 代码结构体检（管理侧）。
 * 与 GraphController 同一条边界：刻意**不进**公网白名单（app.module.ts 的 exclude 表）
 * —— 它是站主工具，走管理凭据防线（AdminTokenMiddleware）。
 */
@Controller('architecture')
export class ArchitectureController {
  constructor(
    @Inject(ArchitectureService) private readonly architecture: ArchitectureService,
  ) {}

  /** 体检摘要 + 与基线的对账（环 / 解析不到 / 不可达 / 反向依赖 / 风格项） */
  @Get('health')
  health() {
    return this.architecture.health();
  }
}
