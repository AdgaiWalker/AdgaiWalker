import { Body, Controller, Inject, Post } from '@nestjs/common';
import { SearchEventsService } from './search-events.service';

@Controller('search-events')
export class SearchEventsController {
  constructor(
    @Inject(SearchEventsService)
    private readonly searchEvents: SearchEventsService,
  ) {}

  @Post()
  async record(
    @Body() body: { query?: string; hadResults?: boolean },
  ): Promise<{ ok: true }> {
    if (body.hadResults === false) {
      await this.searchEvents.recordMiss(body.query);
    }
    return { ok: true };
  }
}
