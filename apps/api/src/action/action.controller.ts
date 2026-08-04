import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ActionService } from './action.service';

@Controller('actions')
export class ActionController {
  constructor(@Inject(ActionService) private readonly actions: ActionService) {}

  @Get()
  list(@Query('status') status?: string, @Query('kind') kind?: string, @Query('limit') limit?: string) {
    return this.actions.list({ status, kind, limit: limit ? Number(limit) : undefined });
  }

  @Post()
  create(@Body() body: { title?: string; note?: string; kind?: string; plannedDate?: string | null }) {
    return this.actions.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { title?: string; note?: string | null; plannedDate?: string | null }) {
    return this.actions.update(id, body);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) { return this.actions.complete(id); }

  @Post(':id/reopen')
  reopen(@Param('id') id: string) { return this.actions.reopen(id); }
}
