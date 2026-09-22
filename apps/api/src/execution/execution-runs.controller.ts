import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AgentExecutionService } from './agent-execution.service';

/**
 * 后台执行入口。历史 AgentRun 仍由 GET /ops/runs 读取。
 * 来源固定为站主，不从请求体接收 origin 或 actor。
 */
@Controller('ops/execution-runs')
export class ExecutionRunsController {
  constructor(@Inject(AgentExecutionService) private readonly runs: AgentExecutionService) {}

  @Post()
  submit(@Body() body: unknown) {
    return this.runs.accept(body);
  }

  @Get()
  list(@Query('cursor') cursor?: string, @Query('limit') limit?: string, @Query('agentId') agentId?: string) {
    return this.runs.ownedRuns(cursor, limit === undefined ? 20 : Number(limit), agentId);
  }

  @Get(':id/stream')
  async stream(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    await this.runs.ownedRun(id);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const disconnect = new AbortController();
    req.on('close', () => { if (!res.writableEnded) disconnect.abort(); });
    const flushable = res as Response & { flush?: () => void };
    await this.runs.streamOwned(id, disconnect.signal, (chunk) => { res.write(chunk); flushable.flush?.(); });
    res.end();
  }

  @Get(':id/events')
  events(@Param('id') id: string, @Query('after') after?: string) {
    return this.runs.ownedEvents(id, after);
  }

  @Post(':id/stop')
  stop(@Param('id') id: string) {
    return this.runs.stopOwned(id);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.runs.ownedRun(id);
  }
}
