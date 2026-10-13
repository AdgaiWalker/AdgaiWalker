import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { AgentUnitService } from './agent-unit.service';
import { AgentRunnerService } from './agent-runner.service';

/**
 * Agent 角色目录 + **唯一的直调入口**（试一句话）。
 *
 * 这里曾经挂过四个面：`run-file`（把 content/log 文件读进提示词，与工作站重复）、
 * `compare`（承诺 2~4 个引擎并排对比，而直调明令禁止换引擎——实现直接返回
 * `execution-denied` 占位，等于假功能）、`agents/:id/runs`（读 G01 之后就不再写入的
 * 只读历史表 AgentRun，现行运行在 `GET /ops/runs`）、`agents/log-files`（只服务
 * run-file）。四个一起删：留着就是让调用方以为这里有第二套运行系统。
 */
@Controller()
export class AgentUnitController {
  constructor(
    @Inject(AgentUnitService) private readonly service: AgentUnitService,
    @Inject(AgentRunnerService) private readonly runnerService: AgentRunnerService,
  ) {}

  @Get('agents')
  list() {
    return this.service.list();
  }

  /** 试一句话：无文件的聊天式直调（走统一执行栈，失败如实报错） */
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
}
