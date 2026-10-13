import { Controller, Delete, Get, Inject, Param } from '@nestjs/common';
import { ConversationDeletionService } from './conversation-deletion.service';

@Controller('admin')
export class ConversationDeletionController {
  constructor(@Inject(ConversationDeletionService) private readonly deletions: ConversationDeletionService) {}

  @Delete('log-resources/conversations/:conversationId')
  deleteConversation(@Param('conversationId') conversationId: string) {
    return this.deletions.requestDelete(conversationId, 'owner');
  }

  @Get('log-deletions/:id')
  taskStatus(@Param('id') id: string) {
    return this.deletions.taskStatus(id);
  }
}
