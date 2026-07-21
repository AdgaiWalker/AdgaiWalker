import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DEFAULT_LIST_LIMIT, type CluePoolStatus } from '@walker/shared';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ClueService } from './clue.service';

@Controller('clues')
@UseGuards(AdminAuthGuard)
export class ClueController {
  constructor(@Inject(ClueService) private readonly clues: ClueService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.clues.list(limit ? Number(limit) : DEFAULT_LIST_LIMIT);
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
