import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { ConversationActionService } from './conversation-action.service';

/** 提醒与复盘（O01）：默认管理鉴权，不加入公开白名单。 */
@Controller('ops')
export class ReminderController {
  constructor(
    @Inject(ReminderService) private readonly reminders: ReminderService,
    @Inject(ConversationActionService) private readonly conversationActions: ConversationActionService,
  ) {}

  /** 到期换算预览：只做纯计算，不落库、不创建发生记录 */
  @Post('reminders/resolve-due')
  resolveDue(@Body() body: { plannedDate?: string | null; timezone?: string | null }) {
    return this.reminders.resolveDue(body ?? {});
  }

  /** 提醒箱：服务端算好到期分类与计数，前端只展示 */
  @Get('reminders/inbox')
  inbox() {
    return this.reminders.inbox();
  }

  /** 某事项的发生记录（含历史） */
  @Get('actions/:id/occurrences')
  occurrences(@Param('id') id: string) {
    return this.reminders.listOccurrences(id);
  }

  /** 提醒处置：完成 / 延后 / 忽略（同一事务写审计与改期，requestKey 幂等） */
  @Post('actions/:id/disposition')
  dispose(@Param('id') id: string, @Body() body: {
    disposition?: string;
    plannedDate?: string | null;
    reason?: string | null;
    repeat?: string | null;
    requestKey?: string;
  }) {
    return this.reminders.dispose({ actionId: id, ...(body ?? {}) });
  }

  /** 某事项的处置历史（审计事实） */
  @Get('actions/:id/dispositions')
  dispositions(@Param('id') id: string) {
    return this.reminders.listDispositions(id);
  }

  /** 访客问题转事项：预览（零写） */
  @Get('conversations/:id/action-preview')
  conversationPreview(@Param('id') id: string) {
    return this.conversationActions.preview(id);
  }

  /** 访客问题转事项：显式转换，requestKey 幂等；不复制会话、不授予 AI 写权限 */
  @Post('conversations/:id/action')
  convertConversation(@Param('id') id: string, @Body() body: {
    title?: string;
    note?: string | null;
    plannedDate?: string | null;
    messageIds?: string[];
    requestKey?: string;
  }) {
    return this.conversationActions.convert({ conversationId: id, ...(body ?? {}) });
  }

  /** 从事项回看证据：删除/过期时如实返回不可用原因 */
  @Get('actions/:id/evidence')
  actionEvidence(@Param('id') id: string) {
    return this.conversationActions.evidence(id);
  }

  @Post('reviews')
  createReview(@Body() body: {
    actionId?: string;
    releaseId?: string | null;
    didWhat?: string;
    observed?: string;
    windowStart?: string | null;
    windowEnd?: string | null;
    nextAttempt?: string;
    evidenceState?: string;
    evidenceNote?: string;
    requestKey?: string;
  }) {
    return this.reminders.createReview(body ?? {});
  }

  @Get('reviews')
  listReviews(@Query('actionId') actionId?: string, @Query('limit') limit?: string) {
    return this.reminders.listReviews({
      actionId: actionId?.trim() || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('reviews/:id')
  getReview(@Param('id') id: string) {
    return this.reminders.getReview(id);
  }

  /** 复盘建议转下一事项（O09）：显式创建，requestKey 幂等 */
  @Post('reviews/:id/action')
  convertReviewToAction(@Param('id') id: string, @Body() body: {
    title?: string;
    note?: string | null;
    plannedDate?: string | null;
    requestKey?: string;
  }) {
    return this.reminders.convertReviewToAction({
      reviewId: id,
      title: body?.title,
      note: body?.note,
      plannedDate: body?.plannedDate,
      requestKey: body?.requestKey ?? '',
    });
  }

  /** 从事项回溯原复盘（O09） */
  @Get('actions/:id/review')
  getReviewForAction(@Param('id') id: string) {
    return this.reminders.getReviewForAction(id);
  }
}
