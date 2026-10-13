import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ConversationQueryService } from './conversation-query.service';

@Controller('ops/conversations')
export class ConversationQueryController {
  constructor(@Inject(ConversationQueryService) private readonly conversations: ConversationQueryService) {}

  @Get()
  list(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('contentSlug') contentSlug?: string,
    @Query('placementKey') placementKey?: string,
    @Query('agentId') agentId?: string,
    @Query('runState') runState?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.conversations.list({ cursor, limit, from, to, contentSlug, placementKey, agentId, runState, keyword });
  }

  @Get(':conversationId')
  detail(@Param('conversationId') conversationId: string) {
    return this.conversations.detail(conversationId);
  }
}
