import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Post, Query } from '@nestjs/common';
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
    @Body() payload: Record<string, unknown>,
    @Headers('x-github-event') event?: string,
  ) {
    if (event && event !== 'push') {
      return { ok: true, status: 'ignored', message: `忽略非 push 事件 (${event})` };
    }
    return this.sync.handleWebhook(payload || {});
  }
}
