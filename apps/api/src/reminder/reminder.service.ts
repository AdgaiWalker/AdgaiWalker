import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import {
  DEFAULT_LIST_LIMIT,
  DEFAULT_SITE_TIMEZONE,
  REMINDER_DISPOSITION_OUTCOME,
  classifyReminderDue,
  countReminderItems,
  utcToZonedDate,
  isReminderDisposition,
  isUnsupportedRepeatRule,
  normalizePlannedDate,
  normalizeReviewWindow,
  reminderOccurrenceKey,
  resolveActionDue,
  type ReminderDisposition,
  type ReminderInbox,
  type ReminderInboxItem,
  type ReviewEvidenceState,
} from '@walker/shared';
import { ApiError, storageUnavailable, validationError } from '../common/http-error';
import { newId } from '../common/ids';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { ACTION_REPOSITORY, type ActionRecord, type ActionRepositoryPort } from '../ports/action.repository';
import { OPERATIONS_JOURNAL, type OperationsJournalPort } from '../ports/operations-journal.port';
import {
  REMINDER_DISPOSITION,
  REMINDER_DISPOSITION_AUDIT_ACTION,
  REMINDER_DISPOSITION_AUDIT_TARGET_TYPE,
  type ReminderDispositionPort,
  type ReminderDispositionResult,
} from '../ports/reminder-disposition.port';
import {
  REMINDER_OCCURRENCE_REPOSITORY,
  type ReminderOccurrenceRecord,
  type ReminderOccurrenceRepositoryPort,
} from '../ports/reminder.repository';
import { REVIEW_ENTRY_REPOSITORY, type ReviewEntryRecord, type ReviewEntryRepositoryPort } from '../ports/review-entry.repository';
import { CONTENT_RELEASE_REPOSITORY, type ContentReleaseRepositoryPort } from '../ports/content-release.repository';

/**
 * 提醒与复盘用例（O01，TECH-DESIGN §12.4）
 *
 * 复用既有 Action，不新建通用任务中心：提醒规则就是「Action + plannedDate/dueAt」。
 * 发生记录以 dedupeKey 唯一约束去重；日期按站点时区换算为 UTC 并保留生成时区。
 * 复盘只登记事实与观察，**不会**自动改内容、发布或把模型建议说成已验证成效。
 */
@Injectable()
export class ReminderService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(ACTION_REPOSITORY) private readonly actions: ActionRepositoryPort,
    @Optional() @Inject(REMINDER_OCCURRENCE_REPOSITORY)
    private readonly occurrences?: ReminderOccurrenceRepositoryPort,
    @Optional() @Inject(REVIEW_ENTRY_REPOSITORY)
    private readonly reviews?: ReviewEntryRepositoryPort,
    @Optional() @Inject(OPERATIONS_JOURNAL)
    private readonly journal?: OperationsJournalPort,
    @Optional() @Inject(REMINDER_DISPOSITION)
    private readonly dispositionRepo?: ReminderDispositionPort,
    @Optional() @Inject(CONTENT_RELEASE_REPOSITORY)
    private readonly releasesRepo?: ContentReleaseRepositoryPort,
  ) {}

  /** 该事项的发生记录（含历史）：站主据此看到「反复延后是否触发过旧到期」 */
  async listOccurrences(actionId: string): Promise<ReminderOccurrenceRecord[]> {
    if (!this.occurrences) throw validationError('reminder-occurrence-repository-unavailable');
    const action = await this.actions.findById(actionId);
    if (!action) throw new ApiError('action-not-found', HttpStatus.NOT_FOUND, '事项不存在');
    return this.occurrences.listForAction(actionId);
  }

  /**
   * 为一条已存在的事项记录一次到期发生（幂等）。
   * 同一事项 + 同一到期瞬时 + 同一时区重复调用只返回既有记录：重复扫描不会重复产生。
   */
  async recordDueOccurrence(action: ActionRecord, now = new Date()) {
    if (!this.occurrences) throw validationError('reminder-occurrence-repository-unavailable');
    if (!action.dueAt || !action.timezone) throw validationError('action-has-no-due-at');
    const dueAt = action.dueAt.toISOString();
    const dedupeKey = reminderOccurrenceKey({ actionId: action.id, dueAt, timezone: action.timezone });
    const { record, created } = await this.occurrences.createOnce({
      id: newId(),
      actionId: action.id,
      dedupeKey,
      dueAt: action.dueAt,
      timezone: action.timezone,
    });
    return { record, created, checkedAt: now.toISOString() };
  }

  /** 到期换算的纯校验入口（供界面预览「某日提醒」对应的 UTC 瞬时）；async 保持与用例层一致的错误语义 */
  async resolveDue(input: { plannedDate?: string | null; timezone?: string | null }) {
    try {
      return resolveActionDue(input);
    } catch (error) {
      throw validationError(error instanceof Error ? error.message : 'invalid-action-due');
    }
  }

  /** 复盘：关联 Action 与已核验发布版本，记录行为/窗口/下一次尝试；requestKey 幂等 */
  async createReview(input: {
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
    actor?: string;
  }): Promise<ReviewEntryRecord> {
    if (!this.reviews) throw validationError('review-entry-repository-unavailable');
    if (!this.prisma.isWritable()) throw storageUnavailable();

    const actionId = input.actionId?.trim() ?? '';
    if (!actionId) throw validationError('review-action-required');
    const action = await this.actions.findById(actionId);
    if (!action) throw new ApiError('action-not-found', HttpStatus.NOT_FOUND, '事项不存在');

    const didWhat = input.didWhat?.trim() ?? '';
    if (!didWhat) throw validationError('review-did-what-required');

    const requestKey = input.requestKey?.trim() ?? '';
    if (!requestKey) throw validationError('review-request-key-required');
    const existing = await this.reviews.findByRequestKey(requestKey);
    if (existing) return existing;

    let window: { windowStart: string | null; windowEnd: string | null };
    try {
      window = normalizeReviewWindow({ windowStart: input.windowStart, windowEnd: input.windowEnd });
    } catch (error) {
      throw validationError(error instanceof Error ? error.message : 'invalid-review-window');
    }

    const evidenceState = (input.evidenceState?.trim() || 'UNKNOWN') as ReviewEvidenceState;
    if (!['SUFFICIENT', 'INSUFFICIENT', 'UNKNOWN'].includes(evidenceState)) {
      throw validationError('invalid-review-evidence-state');
    }

    const releaseId = input.releaseId?.trim() || null;
    if (releaseId && this.releasesRepo) {
      const release = await this.releasesRepo.findById(releaseId);
      if (release && release.stage !== 'PUBLISHED') {
        throw validationError('review-release-must-be-published');
      }
    }

    return this.reviews.createOnce({
      id: newId(),
      actionId,
      releaseId,
      didWhat,
      observed: input.observed?.trim() || null,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      nextAttempt: input.nextAttempt?.trim() || null,
      evidenceState,
      evidenceNote: input.evidenceNote?.trim() || null,
      createdBy: input.actor?.trim() || 'owner',
      requestKey,
    });
  }

  async listReviews(input: { actionId?: string; limit?: number } = {}): Promise<ReviewEntryRecord[]> {
    if (!this.reviews) throw validationError('review-entry-repository-unavailable');
    return this.reviews.list({ actionId: input.actionId, limit: input.limit ?? DEFAULT_LIST_LIMIT });
  }

  /**
   * 提醒处置（O03）：完成 / 延后 / 忽略。
   *
   * - 状态变更审计、Action 改期与发生记录结果在**同一事务**提交（见 ReminderDispositionPort）；
   * - `requestKey` 去重：重复点击返回首次结果，不产生额外副作用；
   * - 未实现的重复规则**明确拒绝**，不静默降级成单次（否则站主以为设了周期提醒，实际只响一次）。
   */
  async dispose(input: {
    actionId?: string;
    disposition?: string;
    plannedDate?: string | null;
    reason?: string | null;
    repeat?: string | null;
    requestKey?: string;
    actor?: string;
  }): Promise<ReminderDispositionResult> {
    if (!this.dispositionRepo) throw validationError('reminder-disposition-unavailable');
    if (!this.prisma.isWritable()) throw storageUnavailable();

    const actionId = input.actionId?.trim() ?? '';
    if (!actionId) throw validationError('reminder-action-required');

    const disposition = input.disposition?.trim() ?? '';
    if (!isReminderDisposition(disposition)) {
      throw validationError('invalid-reminder-disposition');
    }

    const requestKey = input.requestKey?.trim() ?? '';
    if (!requestKey) throw validationError('reminder-request-key-required');

    // 重复规则字段已预留但首期未实现：带值即拒，绝不假装支持
    if (isUnsupportedRepeatRule(input.repeat)) {
      throw new ApiError(
        'reminder-repeat-unsupported',
        HttpStatus.NOT_IMPLEMENTED,
        '重复提醒规则尚未实现，当前仅支持单次提醒',
      );
    }

    if (disposition === 'snooze') {
      const plannedDate = input.plannedDate?.trim() ?? '';
      if (!plannedDate) throw validationError('reminder-snooze-date-required');
      try {
        normalizePlannedDate(plannedDate);
      } catch (error) {
        throw validationError(error instanceof Error ? error.message : 'invalid-planned-date');
      }
    }

    return this.dispositionRepo.dispose({
      actionId,
      disposition,
      plannedDate: input.plannedDate ?? null,
      reason: input.reason?.trim() || null,
      actor: input.actor?.trim() || 'owner',
      requestKey,
      now: new Date(),
    });
  }

  /**
   * 提醒箱读模型（O04）：把「今天该处理什么」在服务端算好，
   * 前端只展示。到期分类用站点本地日期，不用 UTC 日期（跨日会误判）。
   */
  async inbox(now = new Date()): Promise<ReminderInbox> {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const timezone = DEFAULT_SITE_TIMEZONE;
    const today = utcToZonedDate(now.toISOString(), timezone);

    // 只取开放事项：已完成的不该出现在提醒箱
    const records = await this.actions.list({ status: 'OPEN', limit: DEFAULT_LIST_LIMIT });

    const items: ReminderInboxItem[] = [];
    for (const record of records) {
      const occurrence = this.occurrences
        ? await this.occurrences.findLatestForAction(record.id)
        : null;
      items.push({
        actionId: record.id,
        title: record.title,
        note: record.note,
        status: record.status,
        plannedDate: record.plannedDate,
        dueAt: record.dueAt ? record.dueAt.toISOString() : null,
        timezone: record.timezone,
        dueState: classifyReminderDue({ plannedDate: record.plannedDate, today }),
        occurrenceOutcome: occurrence?.outcome ?? null,
        hasPendingOccurrence: occurrence?.outcome === 'PENDING',
        contentSlug: record.entityType === 'CONTENT' ? record.entityId : null,
      });
    }

    return {
      today,
      timezone,
      items,
      counts: countReminderItems(items),
      generatedAt: now.toISOString(),
    };
  }

  /** 某事项的处置历史（审计事实，按时间正序） */
  async listDispositions(actionId: string) {
    if (!this.journal) throw validationError('reminder-disposition-unavailable');
    const action = await this.actions.findById(actionId);
    if (!action) throw new ApiError('action-not-found', HttpStatus.NOT_FOUND, '事项不存在');
    const trail = await this.journal.auditTrail(
      REMINDER_DISPOSITION_AUDIT_TARGET_TYPE,
      actionId,
      DEFAULT_LIST_LIMIT,
    );
    // auditRecord 是通用表：只回处置事实，不把将来同 targetId 的其它审计混进来
    return trail.filter((entry) => entry.action === REMINDER_DISPOSITION_AUDIT_ACTION);
  }

  async getReview(id: string): Promise<ReviewEntryRecord> {
    if (!this.reviews) throw validationError('review-entry-repository-unavailable');
    const review = await this.reviews.findById(id);
    if (!review) throw new ApiError('review-not-found', HttpStatus.NOT_FOUND, '找不到复盘记录');
    return review;
  }

  /**
   * 复盘建议显式转下一事项（O09，TECH-DESIGN §12.4）。
   *
   * 红线：
   * 1. 显式操作：站主明确点击才创建，绝不自动选题（不创建 Seed）、不自动发布；
   * 2. 保留复盘引用：新 Action 的 entityType 为 'REVIEW'，entityId 为 review.id；
   * 3. 幂等与提醒：基于 requestKey 去重，支持设置排期并推导到期瞬时。
   */
  async convertReviewToAction(input: {
    reviewId: string;
    title?: string;
    note?: string | null;
    plannedDate?: string | null;
    requestKey: string;
    actor?: string;
  }) {
    if (!this.reviews) throw validationError('review-entry-repository-unavailable');
    if (!this.prisma.isWritable()) throw storageUnavailable();

    const reviewId = input.reviewId?.trim() ?? '';
    if (!reviewId) throw validationError('review-id-required');

    const requestKey = input.requestKey?.trim() ?? '';
    if (!requestKey) throw validationError('review-action-request-key-required');

    // 幂等：同一 requestKey 已转过则直接返回既有事项
    const existing = await this.findActionByRequestKey(requestKey);
    if (existing) return { action: existing, replayed: true };

    const review = await this.reviews.findById(reviewId);
    if (!review) throw new ApiError('review-not-found', HttpStatus.NOT_FOUND, '找不到复盘记录');

    const nextAttempt = review.nextAttempt?.trim();
    if (!nextAttempt) {
      throw validationError('review-has-no-next-attempt');
    }

    const title = input.title?.trim() || `下一尝试：${nextAttempt}`;

    let due;
    try {
      due = await this.resolveDue({ plannedDate: input.plannedDate ?? null });
    } catch (error) {
      throw validationError(error instanceof Error ? error.message : 'invalid-planned-date');
    }

    const action = await this.actions.create({
      id: newId(),
      title,
      note: input.note?.trim() || `源自复盘 ${review.id}：${review.didWhat}`,
      kind: 'TASK',
      entityType: 'REVIEW',
      entityId: review.id,
      plannedDate: input.plannedDate?.trim() || null,
      dueAt: due.dueAt ? new Date(due.dueAt) : null,
      timezone: due.timezone,
      source: 'HUMAN',
    });

    // 记录审计：action='review.convert', requestId=requestKey
    await this.appendConversionAudit(action.id, requestKey, input.actor ?? 'owner');

    return { action, replayed: false };
  }

  /** 从事项回溯原复盘（O09） */
  async getReviewForAction(actionId: string): Promise<ReviewEntryRecord | null> {
    if (!this.reviews) throw validationError('review-entry-repository-unavailable');
    const action = await this.actions.findById(actionId);
    if (!action) throw new ApiError('action-not-found', HttpStatus.NOT_FOUND, '事项不存在');
    if (action.entityType !== 'REVIEW' || !action.entityId) return null;
    return this.reviews.findById(action.entityId);
  }

  private async findActionByRequestKey(requestKey: string): Promise<ActionRecord | null> {
    const db = this.prisma.getClient();
    if (!db) return null;
    const audit = await db.auditRecord.findFirst({
      where: { targetType: 'action', action: 'review.convert', requestId: requestKey },
      orderBy: { createdAt: 'asc' },
    });
    if (!audit) return null;
    return this.actions.findById(audit.targetId);
  }

  private async appendConversionAudit(actionId: string, requestKey: string, actor: string) {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    await db.auditRecord.create({
      data: {
        id: newId(),
        actor,
        action: 'review.convert',
        targetType: 'action',
        targetId: actionId,
        outcome: 'converted',
        beforeHash: null,
        afterHash: null,
        requestId: requestKey,
      },
    });
  }
}
