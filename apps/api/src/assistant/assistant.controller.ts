import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  extractClientIpKey,
  resolveOrSetAnonId,
} from '../auth/anon-cookie';
import { AssistantService } from './assistant.service';

/** HTTP 薄层：协议进出 → 调用用例，不写领域规则 */
@Controller('assistant')
export class AssistantController {
  constructor(
    @Inject(AssistantService) private readonly assistant: AssistantService,
  ) {}

  @Post()
  async ask(
    @Body() body: { body?: string; source?: string; sessionId?: string | null },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('cookie') cookieHeader?: string,
  ) {
    const anonId = resolveOrSetAnonId(cookieHeader, res);
    const ipKey = extractClientIpKey(req);
    const result = await this.assistant.ask({
      body: body.body ?? '',
      source: body.source,
      anonId,
      ipKey,
      sessionId: body.sessionId ?? null,
      isAuthenticated: false,
    });
    res.status(201);
    return result;
  }

  /** 管理侧问题池：倒序列表（转题苗由 admin 人工触发） */
  @Get('runs')
  async runs(@Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 50;
    return this.assistant.listRuns(Number.isFinite(n) ? n : 50);
  }
}
