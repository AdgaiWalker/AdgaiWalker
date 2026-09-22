import { Controller, Inject, Post } from '@nestjs/common';
import { RunRetentionService } from './run-retention.service';

/** 只清理已到期的后台运行。返回不含凭据和服务器路径。 */
@Controller('ops/run-retention')
export class RunRetentionController {
  constructor(@Inject(RunRetentionService) private readonly retention: RunRetentionService) {}

  @Post('cleanup')
  cleanup() {
    const dir = process.env.WALKER_RUNS_DIR || 'data/runs';
    return this.retention.cleanup(dir);
  }
}
