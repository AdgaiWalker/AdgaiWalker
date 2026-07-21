import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { SeedService } from './seed.service';

@Controller('seeds')
@UseGuards(AdminAuthGuard)
export class SeedController {
  constructor(@Inject(SeedService) private readonly seeds: SeedService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.seeds.list(limit ? Number(limit) : 50);
  }

  @Post()
  create(@Body() body: { title?: string }) {
    return this.seeds.create(body.title ?? '');
  }

  @Post(':id/link')
  link(
    @Param('id') id: string,
    @Body() body: { clueId?: string; asPrimary?: boolean },
  ) {
    return this.seeds.linkClue(id, body.clueId ?? '', body.asPrimary === true);
  }

  @Post(':id/promote')
  promote(@Param('id') id: string, @Body() body: { clueId?: string }) {
    return this.seeds.promote(id, body.clueId ?? '');
  }

  @Post(':id/two-questions')
  twoQ(
    @Param('id') id: string,
    @Body() body: { severity?: string; selfInterest?: string },
  ) {
    return this.seeds.setTwoQuestions(
      id,
      body.severity ?? '',
      body.selfInterest ?? '',
    );
  }
}
