import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import type { CluePoolStatus } from '@walker/shared';
import { ClueService } from './clue.service';

@Controller('clues')
export class ClueController {
  constructor(@Inject(ClueService) private readonly clues: ClueService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.clues.list(limit ? Number(limit) : 50);
  }

  @Post()
  create(@Body() body: { body?: string; source?: string }) {
    return this.clues.createManual(body.body ?? '', body.source);
  }

  @Patch(':id/pool')
  setPool(
    @Param('id') id: string,
    @Body() body: { poolStatus?: CluePoolStatus },
  ) {
    return this.clues.setPoolStatus(id, body.poolStatus ?? 'candidate');
  }
}
