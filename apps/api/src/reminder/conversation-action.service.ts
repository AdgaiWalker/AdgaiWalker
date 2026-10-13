import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import {
  ACTION_SUMMARY_MAX_LENGTH,
  summarizeVisitorQuestion,
  type ActionEvidence,
  type ActionEvidenceRef,
  type ConversationLogDetail,
} from '@walker/shared';
import { ApiError, storageUnavailable, validationError } from '../common/http-error';
import { newId } from '../common/ids';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { ACTION_REPOSITORY, type ActionRepositoryPort } from '../ports/action.repository';
import { CONVERSATION_ACTION_COMMIT, type ConversationActionCommitPort } from '../ports/conversation-action-commit.port';
import { CONVERSATION_QUERY_REPOSITORY, type ConversationQueryRepositoryPort } from '../ports/conversation-query.repository';
import { ConversationQueryService } from '../log-resources/conversation-query.service';
import { ReminderService } from './reminder.service';

/** 会话来源的事项统一标识：entityId 存会话 id（只存引用，不复制正文）。 */
const CONVERSATION_ENTITY_TYPE = 'CONVERSATION';

/**
 * 访客问题转更新事项（O05，PRD §12 / TECH-DESIGN §12.4）
 *
 * 三条红线：
 * 1. **显式操作**：只有站主点「转为更新事项」才创建，绝不自动把访客问题变成任务；
 * 2. **不复制会话**：事项上只存软引用（会话 id + 消息 id + 保存时刻）与站主确认过的摘要，
 *    绝不搬运完整访客会话正文，也不修改原内容；
 * 3. **不授予 AI 写权限**：本用例只写 Action，不创建授权、不触发候选生成，
 *    转事项不改变任何 AI 的内容写能力。
 */
@Injectable()
export class ConversationActionService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(ACTION_REPOSITORY) private readonly actions: ActionRepositoryPort,
    @Inject(CONVERSATION_ACTION_COMMIT) private readonly commits: ConversationActionCommitPort,
    @Inject(ReminderService) private readonly reminders: ReminderService,
    @Optional() @Inject(CONVERSATION_QUERY_REPOSITORY)
    private readonly conversations?: ConversationQueryRepositoryPort,
    @Optional() @Inject(ConversationQueryService)
    private readonly conversationQuery?: ConversationQueryService,
  ) {}

  /** 会话详情 + 建议摘要：供界面预填，站主可改；本调用零写入。 */
  async preview(conversationId: string) {
    const detail = await this.requireConversation(conversationId);
    const visitorMessage = detail.turns
      .flatMap((turn) => turn.messages)
      .find((message) => message.role === 'visitor');
    const summary = visitorMessage
      ? summarizeVisitorQuestion(visitorMessage.body, 120)
      : `${detail.contentSlug} 的访客对话`;
    return {
      conversationId: detail.conversationId,
      contentSlug: detail.contentSlug,
      title: `回应访客：${summary}`,
      summary,
      messageIds: visitorMessage ? [visitorMessage.id] : [],
      turnCount: detail.turns.length,
    };
  }

  /**
   * 转事项：按 requestKey 去重（同一次操作重放返回同一条事项，不建第二条）。
   * 只有显式调用才创建——不存在任何自动路径落到这里。
   */
  async convert(input: {
    conversationId?: string;
    title?: string;
    note?: string | null;
    plannedDate?: string | null;
    messageIds?: string[];
    requestKey?: string;
    actor?: string;
  }) {
    if (!this.prisma.isWritable()) throw storageUnavailable();

    const conversationId = input.conversationId?.trim() ?? '';
    if (!conversationId) throw validationError('conversation-id-required');
    const requestKey = input.requestKey?.trim() ?? '';
    if (!requestKey) throw validationError('conversation-action-request-key-required');

    // 幂等：同一 requestKey 已转过就直接返回既有事项
    const existing = await this.findByRequestKey(requestKey);
    if (existing) return { action: existing, replayed: true };

    const detail = await this.requireConversation(conversationId);

    const title = (input.title?.trim() || `回应访客：${detail.contentSlug}`);
    if (title.length > ACTION_SUMMARY_MAX_LENGTH) {
      throw validationError('action-title-too-long');
    }

    // 只保留**该会话内真实存在**的消息 id：不信任调用方传入的任意 id
    const knownIds = new Set(detail.turns.flatMap((turn) => turn.messages.map((m) => m.id)));
    const messageIds = (input.messageIds ?? []).filter((id) => knownIds.has(id));

    const evidenceRef: ActionEvidenceRef = {
      conversationId: detail.conversationId,
      messageIds,
      capturedAt: new Date().toISOString(),
    };

    let due;
    try {
      due = await this.reminders.resolveDue({ plannedDate: input.plannedDate ?? null });
    } catch (error) {
      throw validationError(error instanceof Error ? error.message : 'invalid-planned-date');
    }

    const committed = await this.commits.commit({
      requestKey,
      actor: input.actor ?? 'owner',
      action: {
      id: newId(),
      title,
      note: input.note?.trim() || null,
      kind: 'TASK',
      entityType: CONVERSATION_ENTITY_TYPE,
      entityId: detail.conversationId,
      plannedDate: input.plannedDate?.trim() || null,
      dueAt: due.dueAt ? new Date(due.dueAt) : null,
      timezone: due.timezone,
      source: 'HUMAN',
      evidenceRef,
      },
    });
    return { action: await this.requireCommittedAction(committed.actionId), replayed: committed.replayed };
  }

  /**
   * 从事项回看证据。
   * 会话被删除、超出保留期或从未存在时，如实返回不可用原因——**绝不假装还看得到**。
   */
  async evidence(actionId: string): Promise<ActionEvidence> {
    const action = await this.actions.findById(actionId);
    if (!action) throw new ApiError('action-not-found', HttpStatus.NOT_FOUND, '事项不存在');
    const ref = action.evidenceRef;
    if (!ref) {
      return {
        available: false,
        reason: 'missing',
        conversationId: null,
        contentSlug: null,
        capturedAt: null,
        messages: [],
      };
    }

    let detail: ConversationLogDetail | null = null;
    try {
      detail = await this.loadConversation(ref.conversationId);
    } catch {
      detail = null;
    }

    if (!detail) {
      // 区分「删过」与「过期/不存在」：墓碑存在即删除，否则按保留期口径说明
      const deleted = await this.isDeleted(ref.conversationId);
      return {
        available: false,
        reason: deleted ? 'deleted' : 'expired',
        conversationId: ref.conversationId,
        contentSlug: null,
        capturedAt: ref.capturedAt,
        messages: [],
      };
    }

    const all = detail.turns.flatMap((turn) => turn.messages);
    // 站主指定了消息就只回那些；没指定则回整段会话的访客问题（仍是保留期内正文）
    const selected = ref.messageIds.length
      ? all.filter((message) => ref.messageIds.includes(message.id))
      : all.filter((message) => message.role === 'visitor');

    return {
      available: true,
      reason: null,
      conversationId: detail.conversationId,
      contentSlug: detail.contentSlug,
      capturedAt: ref.capturedAt,
      messages: selected.map((message) => ({
        id: message.id,
        role: message.role,
        body: message.body,
        createdAt: message.createdAt,
      })),
    };
  }

  /** Replay lookup precedes conversation availability so a deleted source cannot erase an acknowledged result. */
  private async findByRequestKey(requestKey: string) {
    const actionId = await this.commits.findByRequestKey(requestKey);
    return actionId ? this.requireCommittedAction(actionId) : null;
  }

  private async requireCommittedAction(actionId: string) {
    const action = await this.actions.findById(actionId);
    if (!action) throw storageUnavailable();
    return action;
  }

  private async isDeleted(conversationId: string): Promise<boolean> {
    const db = this.prisma.getClient();
    if (!db) return false;
    const tombstone = await db.deletionTombstone.findUnique({ where: { conversationId } });
    return Boolean(tombstone);
  }

  /** 走既有会话查询服务，保留期口径与 records 详情完全一致（不另写一套过期判断）。 */
  private async loadConversation(conversationId: string): Promise<ConversationLogDetail | null> {
    if (this.conversationQuery) return this.conversationQuery.detail(conversationId);
    if (this.conversations) {
      return this.conversations.detail(conversationId, new Date(0));
    }
    throw validationError('conversation-query-unavailable');
  }

  private async requireConversation(conversationId: string): Promise<ConversationLogDetail> {
    const detail = await this.loadConversation(conversationId).catch(() => null);
    if (!detail) {
      throw new ApiError(
        'conversation-not-found',
        HttpStatus.NOT_FOUND,
        '这段会话不可用：可能已删除、已过期或从未记录',
      );
    }
    return detail;
  }
}
