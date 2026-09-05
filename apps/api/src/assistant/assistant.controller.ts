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

  /**
   * 流式问答（SSE）：事件序列 text → done；text 携增量、done 携 Run 合同终值。
   * 兜底路径（AI 关/预算触顶/流式异常）只发 done（answer 为整体文本），前端契约统一。
   */
  @Post('stream')
  async stream(
    @Body() body: { body?: string; source?: string; sessionId?: string | null },
    @Req() req: Request,
    @Res() res: Response,
    @Headers('cookie') cookieHeader?: string,
  ) {
    const anonId = resolveOrSetAnonId(cookieHeader, res);
    const ipKey = extractClientIpKey(req);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
      const result = await this.assistant.askStream(
        {
          body: body.body ?? '',
          source: body.source ?? 'assistant-stream',
          anonId,
          ipKey,
          sessionId: body.sessionId ?? null,
          isAuthenticated: false,
        },
        (delta) => send('text', { delta }),
      );
      send('done', result);
    } catch (error) {
      send('error', {
        message:
          error instanceof Error ? error.message : 'assistant-stream-failed',
      });
    } finally {
      res.end();
    }
  }
}
