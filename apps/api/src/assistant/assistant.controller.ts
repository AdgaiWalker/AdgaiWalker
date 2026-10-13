import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { assistantStreamEventId, type AssistantStreamEvent } from '@walker/shared';
import { newId } from '../common/ids';
import {
  extractClientIpKey,
  resolveOrSetAnonId,
} from '../auth/anon-cookie';
import { AssistantService } from './assistant.service';
import { PublicAssistantService } from './public-assistant.service';

/** HTTP 薄层：协议进出 → 调用用例，不写领域规则 */
@Controller('assistant')
export class AssistantController {
  constructor(
    @Inject(AssistantService) private readonly assistant: AssistantService,
    @Inject(PublicAssistantService) private readonly publicAssistant: PublicAssistantService,
  ) {}

  @Get('placements/:placementKey/:scopeSlug')
  publicPlacement(
    @Param('placementKey') placementKey: string,
    @Param('scopeSlug') scopeSlug: string,
  ) {
    return this.publicAssistant.placementManifest(placementKey, scopeSlug);
  }

  @Post('events')
  recordInteraction(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('cookie') cookieHeader?: string,
  ) {
    const anonId = resolveOrSetAnonId(cookieHeader, res);
    res.setHeader('Cache-Control', 'private, no-store');
    return this.publicAssistant.recordInteraction(anonId, extractClientIpKey(req), body);
  }

  @Get('conversations/:placementKey/:scopeSlug')
  publicConversationHistory(
    @Param('placementKey') placementKey: string,
    @Param('scopeSlug') scopeSlug: string,
    @Res({ passthrough: true }) res: Response,
    @Headers('cookie') cookieHeader?: string,
  ) {
    const anonId = resolveOrSetAnonId(cookieHeader, res);
    res.setHeader('Cache-Control', 'private, no-store');
    return this.publicAssistant.conversationHistory(anonId, placementKey, scopeSlug);
  }

  @Post('conversations/:placementKey/:scopeSlug/stop')
  stopPublicMessage(
    @Param('placementKey') placementKey: string,
    @Param('scopeSlug') scopeSlug: string,
    @Body() body: { messageId?: string },
    @Res({ passthrough: true }) res: Response,
    @Headers('cookie') cookieHeader?: string,
  ) {
    const anonId = resolveOrSetAnonId(cookieHeader, res);
    res.setHeader('Cache-Control', 'private, no-store');
    return this.publicAssistant.stopMessage(anonId, placementKey, scopeSlug, body.messageId ?? '');
  }

  @Post()
  async ask(
    @Body() body: { body?: string; source?: string; sessionId?: string | null; requestKey?: string | null; conversationId?: string | null; placementKey?: string | null; scopeSlug?: string | null; memberKey?: string | null; deploymentGeneration?: number | null },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('cookie') cookieHeader?: string,
  ) {
    const anonId = resolveOrSetAnonId(cookieHeader, res);
    const ipKey = extractClientIpKey(req);
    const result = await this.publicAssistant.ask({
      body: body.body ?? '',
      source: body.source,
      anonId,
      ipKey,
      sessionId: body.sessionId ?? null,
      requestKey: body.requestKey ?? null,
      conversationId: body.conversationId ?? null,
      placementKey: body.placementKey ?? null,
      scopeSlug: body.scopeSlug ?? null,
      memberKey: body.memberKey ?? null,
      deploymentGeneration: body.deploymentGeneration ?? null,
    });
    res.status(201);
    if (result.conversationId) {
      res.once('finish', () => { void this.publicAssistant.markSent(anonId, result.messageId); });
      res.once('close', () => {
        if (!res.writableFinished) void this.publicAssistant.markUnknown(anonId, result.messageId);
      });
    }
    return result;
  }

  @Post('messages/:messageId/ack')
  async acknowledgeMessage(
    @Param('messageId') messageId: string,
    @Res({ passthrough: true }) res: Response,
    @Headers('cookie') cookieHeader?: string,
  ) {
    const anonId = resolveOrSetAnonId(cookieHeader, res);
    return this.publicAssistant.acknowledgeMessage(anonId, messageId);
  }

  /** 管理侧问题池：倒序列表（转题苗由 admin 人工触发） */
  @Get('runs')
  async runs(@Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 50;
    return this.assistant.listRuns(Number.isFinite(n) ? n : 50);
  }

  /** 流式问答 SSE v2：accepted → delta* → done；错误使用同一稳定消息身份。 */
  @Post('stream')
  async stream(
    @Body() body: { body?: string; source?: string; sessionId?: string | null; requestKey?: string | null; conversationId?: string | null; placementKey?: string | null; scopeSlug?: string | null; memberKey?: string | null; deploymentGeneration?: number | null },
    @Req() req: Request,
    @Res() res: Response,
    @Headers('cookie') cookieHeader?: string,
  ) {
    const anonId = resolveOrSetAnonId(cookieHeader, res);
    const ipKey = extractClientIpKey(req);
    const requestId = typeof body.requestKey === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(body.requestKey)
      ? body.requestKey
      : newId();
    let messageId = requestId;
    let attemptId = requestId;
    let runId: string | null = null;
    let sequence = -1;
    let doneFrameSent = false;
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const send = (event: AssistantStreamEvent) => {
      res.write(`id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      const flushable = res as Response & { flush?: () => void };
      flushable.flush?.();
    };
    try {
      const result = await this.publicAssistant.askStream(
        {
          body: body.body ?? '',
          source: body.source ?? 'assistant-stream',
          anonId,
          ipKey,
          sessionId: body.sessionId ?? null,
          requestKey: body.requestKey ?? null,
          requestId,
          conversationId: body.conversationId ?? null,
          placementKey: body.placementKey ?? null,
          scopeSlug: body.scopeSlug ?? null,
          memberKey: body.memberKey ?? null,
          deploymentGeneration: body.deploymentGeneration ?? null,
        },
        {
          accepted: (event) => { messageId = event.messageId; attemptId = event.attemptId; runId = event.runId; sequence = event.sequence; send(event); },
          delta: (event) => { runId = event.runId; sequence = event.sequence; send(event); },
          done: (event) => { runId = event.runId; sequence = event.sequence; send(event); doneFrameSent = true; },
          error: (event) => { runId = event.runId; sequence = event.sequence; send(event); },
        },
      );
      if (result.conversationId && doneFrameSent && !res.destroyed) {
        res.once('finish', () => { void this.publicAssistant.markSent(anonId, result.messageId); });
        res.once('close', () => {
          if (!res.writableFinished) void this.publicAssistant.markUnknown(anonId, result.messageId);
        });
      } else if (result.conversationId) {
        await this.publicAssistant.markUnknown(anonId, result.messageId);
      }
    } catch (error) {
      sequence += 1;
      if (res.destroyed) return;
      const response = error instanceof HttpException ? error.getResponse() : null;
      const responseRecord = typeof response === 'object' && response !== null
        ? response as Record<string, unknown>
        : null;
      const candidateCode = typeof responseRecord?.code === 'string' ? responseRecord.code : '';
      const code = candidateCode === 'placement-generation-conflict' || candidateCode === 'placement-member-unavailable'
        ? candidateCode
        : 'assistant-stream-failed';
      send({
        version: 2,
        type: 'error',
        eventId: assistantStreamEventId(messageId, sequence),
        requestId,
        messageId,
        attemptId,
        runId,
        sequence,
        code,
        message: code === 'assistant-stream-failed' ? '本次请求无法处理，请稍后重试。' : '公开成员列表已更新，请刷新后重试。',
      });
    } finally {
      res.end();
    }
  }
}
