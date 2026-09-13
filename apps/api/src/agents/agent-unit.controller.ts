import { Body, Controller, Delete, Get, Inject, Param, Post } from '@nestjs/common';
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

  @Post('agents')
  save(
    @Body()
    body: {
      id: string;
      name: string;
      icon?: string;
      providerId?: string | null;
      modelId?: string;
      prompt: string;
    },
  ) {
    return this.service.upsert(body);
  }

  @Delete('agents/:id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { ok: true };
  }

  @Post('agents/:id/run-file')
  runFile(
    @Param('id') id: string,
    @Body()
    body: {
      targetFile: string;
      instruction: string;
    },
  ) {
    return this.runnerService.runFile(id, body);
  }

  @Get('agents/:id/runs')
  getRuns(@Param('id') id: string) {
    return this.runnerService.getRunsByAgent(id);
  }

  @Get('runs/:runId/trace')
  getRunTrace(@Param('runId') runId: string) {
    return this.runnerService.getRunTrace(runId);
  }
}
