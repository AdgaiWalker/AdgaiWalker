import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../common/http-error';
import { ContentSyncService } from './content-sync.service';

@Controller('admin/content/sync')
export class ContentSyncController {
  constructor(
    @Inject(ContentSyncService)
    private readonly sync: ContentSyncService,
  ) {}

  @Get('status')
  async getStatus(@Query('force') force?: string) {
    return this.sync.getStatus(force === 'true' || force === '1');
  }

  @Post('pull')
  @HttpCode(HttpStatus.OK)
  async pull() {
    return this.sync.pull();
  }

  @Post('backup-drafts')
  @HttpCode(HttpStatus.OK)
  async backupDrafts() {
    return this.sync.backupDrafts();
  }
}

function verifyGithubSignature(rawBody: Buffer, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`, 'utf8');
  const provided = Buffer.from(signatureHeader.trim(), 'utf8');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

@Controller('webhooks')
export class GithubWebhookController {
  constructor(
    @Inject(ContentSyncService)
    private readonly sync: ContentSyncService,
  ) {}

  @Post('github')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: Record<string, unknown>,
    @Headers('x-github-event') event?: string,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    const secret = process.env.WALKER_GITHUB_WEBHOOK_SECRET?.trim();
    if (!secret) {
      throw new ApiError('webhook-secret-not-configured', HttpStatus.FORBIDDEN, 'Webhook 验签密钥未配置，拒绝处理');
    }
    const rawBytes = req.rawBody ?? Buffer.from(JSON.stringify(payload ?? {}), 'utf8');
    if (!verifyGithubSignature(rawBytes, signature, secret)) {
      throw new ApiError('invalid-webhook-signature', HttpStatus.UNAUTHORIZED, 'Webhook 签名校验失败');
    }
    if (event && event !== 'push') {
      return { ok: true, status: 'ignored', message: `忽略非 push 事件 (${event})` };
    }
    return this.sync.handleWebhook(payload || {});
  }
}
