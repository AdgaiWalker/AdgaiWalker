import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_SITE_TIMEZONE,
  REMINDER_DISPOSITION_OUTCOME,
  isReminderOutcome,
  resolveActionDue,
  type ReminderDisposition,
} from '@walker/shared';
import { ApiError, storageUnavailable, validationError } from '../common/http-error';
import { newId } from '../common/ids';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import type { AuditEntry } from '../ports/operations-journal.port';
import {
  REMINDER_DISPOSITION_AUDIT_ACTION,
  REMINDER_DISPOSITION_AUDIT_TARGET_TYPE,
  type ReminderDispositionInput,
  type ReminderDispositionPort,
  type ReminderDispositionResult,
} from '../ports/reminder-disposition.port';

@Injectable()
export class PrismaReminderDispositionRepository implements ReminderDispositionPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const client = this.prisma.getClient();
    if (!client) throw storageUnavailable();
    return client;
  }

  async findByRequestKey(requestKey: string): Promise<ReminderDispositionResult | null> {
    // 幂等依据：审计行本身带 requestId，处置成功时必写一条。
    // 不额外建表——审计已是既有的、原子提交的事实来源。
    const row = await this.db().auditRecord.findFirst({
      where: {
        targetType: REMINDER_DISPOSITION_AUDIT_TARGET_TYPE,
        action: REMINDER_DISPOSITION_AUDIT_ACTION,
        requestId: requestKey,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!row) return null;
    return {
      actionId: row.targetId,
      disposition: (row.outcome as ReminderDisposition) ?? 'complete',
      occurrenceId: row.beforeHash ?? null,
      occurrenceOutcome: null,
      dueAt: null,
      replayed: true,
    };
  }

  /**
   * 处置 = 一个事务里做完三件事：
   * 1. 把当前到期发生记录置为对应结果；
   * 2. 完成/忽略/延后各自对 Action 的原子更新；
   * 3. 写审计（带 requestId，幂等重放据此识别）。
   * 中途任何一步失败整体回滚，不留下「提醒已处理、事项仍指旧到期」的半截状态。
   */
  async dispose(input: ReminderDispositionInput): Promise<ReminderDispositionResult> {
    const db = this.db();
    const outcome = REMINDER_DISPOSITION_OUTCOME[input.disposition];
    if (!isReminderOutcome(outcome)) throw validationError('invalid-reminder-disposition');

    // 幂等前置检查：同一请求键已执行过则直接回放，绝不产生第二次副作用
    const replayed = await this.findByRequestKey(input.requestKey);
    if (replayed) return replayed;

    return db.$transaction(async (tx) => {
      const action = await tx.action.findUnique({ where: { id: input.actionId } });
      if (!action) throw new ApiError('action-not-found', 404, '事项不存在');

      // 定位「当前到期」的发生记录：按 dueAt 降序取最新一条
      const occurrence = await tx.reminderOccurrence.findFirst({
        where: { actionId: input.actionId },
        orderBy: [{ dueAt: 'desc' }, { createdAt: 'desc' }],
      });

      let nextDueAt: Date | null = action.dueAt;
      let nextPlannedDate = action.plannedDate;
      let nextTimezone = action.timezone;

      if (input.disposition === 'snooze') {
        // 延后：换一个到期日，旧到期随之失效（dueAt 原子重算，不残留旧值）
        let plannedDate: string | null;
        try {
          const due = resolveActionDue({
            plannedDate: input.plannedDate ?? null,
            timezone: action.timezone ?? DEFAULT_SITE_TIMEZONE,
          });
          plannedDate = input.plannedDate ? String(input.plannedDate).trim() : null;
          nextDueAt = due.dueAt ? new Date(due.dueAt) : null;
          nextTimezone = due.timezone;
        } catch (error) {
          throw validationError(error instanceof Error ? error.message : 'invalid-planned-date');
        }
        nextPlannedDate = plannedDate;
      }

      if (input.disposition === 'complete') {
        // 完成：事项结束；保留 plannedDate 作为历史事实，只清掉到期瞬时避免再次被扫描领取
        nextDueAt = null;
        await tx.action.update({
          where: { id: input.actionId },
          data: { status: 'DONE', completedAt: input.now, dueAt: null },
        });
      } else if (input.disposition === 'ignore') {
        // 忽略：撤下这次到期（清 dueAt 使其不再被扫描），但事项**仍保持 OPEN**
        nextDueAt = null;
        await tx.action.update({
          where: { id: input.actionId },
          data: { dueAt: null },
        });
      } else {
        // 延后：写回重算后的 plannedDate/dueAt/timezone
        await tx.action.update({
          where: { id: input.actionId },
          data: {
            plannedDate: nextPlannedDate,
            dueAt: nextDueAt,
            timezone: nextTimezone,
          },
        });
      }

      if (occurrence && occurrence.outcome === 'PENDING') {
        await tx.reminderOccurrence.update({
          where: { id: occurrence.id },
          data: { outcome, reason: input.reason ?? null, resolvedAt: input.now },
        });
      }

      // 审计形状复用既有 AuditEntry（不在此另立一份字段定义）
      const audit: AuditEntry = {
        id: newId(),
        actor: input.actor,
        action: REMINDER_DISPOSITION_AUDIT_ACTION,
        targetType: REMINDER_DISPOSITION_AUDIT_TARGET_TYPE,
        targetId: input.actionId,
        beforeHash: occurrence?.id ?? null,
        afterHash: nextDueAt ? nextDueAt.toISOString() : null,
        outcome: input.disposition,
        requestId: input.requestKey,
      };
      await tx.auditRecord.create({ data: audit });

      return {
        actionId: input.actionId,
        disposition: input.disposition,
        occurrenceId: occurrence?.id ?? null,
        occurrenceOutcome: occurrence ? outcome : null,
        dueAt: nextDueAt,
        replayed: false,
      } satisfies ReminderDispositionResult;
    });
  }
}
