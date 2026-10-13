import { Body, Controller, Get, Header, Inject, Param, Post, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ConversationExportService } from './conversation-export.service';

@Controller('ops/exports')
export class ConversationExportController {
  constructor(@Inject(ConversationExportService) private readonly exports: ConversationExportService) {}

  @Post()
  create(@Body() body: unknown) {
    return this.exports.create(body);
  }

  @Get(':id')
  status(@Param('id') id: string) {
    return this.exports.status(id);
  }

  @Get(':id/download')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    const { job, file } = await this.exports.download(id);
    response.setHeader('X-Export-Row-Count', String(job.rowCount));
    response.setHeader('X-Export-Snapshot-At', job.snapshotAt.toISOString());
    return new StreamableFile(file.stream, {
      type: job.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      disposition: `attachment; filename="walker-conversations-${job.id}.${job.format}"`,
      length: file.byteLength,
    });
  }
}
