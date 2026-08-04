import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { DEFAULT_LIST_LIMIT } from '@walker/shared';
import { SeedService } from './seed.service';

@Controller('seeds')
export class SeedController {
  constructor(@Inject(SeedService) private readonly seeds: SeedService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.seeds.list(limit ? Number(limit) : DEFAULT_LIST_LIMIT);
  }

  @Post()
  create(@Body() body: { title?: string }) {
    return this.seeds.create(body.title ?? '');
  }

  @Patch(':id')
  updateTopic(
    @Param('id') id: string,
    @Body() body: { title?: string; workflowStatus?: import('@walker/shared').TopicStatus; whyNow?: string | null },
  ) {
    return this.seeds.updateTopic(id, body);
  }

  @Post(':id/link')
  link(
    @Param('id') id: string,
    @Body() body: { clueId?: string; asPrimary?: boolean },
  ) {
    return this.seeds.linkClue(id, body.clueId ?? '', body.asPrimary === true);
  }

  @Post(':id/promote')
  promote(
    @Param('id') id: string,
    @Body() body: { clueId?: string; whyNow?: string; brief?: import('@walker/shared').ContentBrief },
  ) {
    return this.seeds.promote(id, body.clueId ?? '', { whyNow: body.whyNow, brief: body.brief });
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
