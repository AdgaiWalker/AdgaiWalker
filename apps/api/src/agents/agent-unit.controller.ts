import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { AgentUnitService } from './agent-unit.service';
import { AgentRunnerService } from './agent-runner.service';

@Controller()
export class AgentUnitController {
  constructor(
    @Inject(AgentUnitService) private readonly service: AgentUnitService,
    @Inject(AgentRunnerService) private readonly runnerService: AgentRunnerService,
  ) {}

  @Get('agents/log-files')
  listLogFiles() {
    return this.runnerService.listLogFiles();
  }

  @Get('agents')
  list() {
    return this.service.list();
  }

  @Post('agents/:id/run-file')
  runFile(
    @Param('id') id: string,
    @Body()
    body: {
      targetFile: string;
      instruction: string;
      /** 引擎覆盖：不改角色配置先试另一个模型/供应商 */
      providerId?: string | null;
      modelId?: string;
      temperature?: number;
    },
  ) {
    return this.runnerService.runFile(id, body);
  }

  /** 试一句话：无文件的聊天式直调（调试主力） */
  @Post('agents/:id/try')
  try(
    @Param('id') id: string,
    @Body()
    body: {
      input: string;
      providerId?: string | null;
      modelId?: string;
      temperature?: number;
    },
  ) {
    return this.runnerService.runChat(id, body);
  }

  /** 同题对比：同一句输入 × 2~4 个引擎目标，并排结果，各自落可归因 run */
  @Post('agents/:id/compare')
  compare(
    @Param('id') id: string,
    @Body()
    body: {
      input: string;
      targets: Array<{ providerId?: string | null; modelId?: string; label?: string }>;
    },
  ) {
    return this.runnerService.compare(id, body);
  }

  @Get('agents/:id/runs')
  getRuns(@Param('id') id: string) {
    return this.runnerService.getRunsByAgent(id);
  }
}
