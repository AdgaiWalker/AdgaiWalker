import type { ReminderDisposition, ReminderOutcome } from '@walker/shared';

export type ReminderDispositionInput = {
  actionId: string;
  disposition: ReminderDisposition;
  /** 仅 snooze 使用：新的到期日期（站点本地 YYYY-MM-DD，按 Action 时区换算） */
  plannedDate?: string | null;
  /** 忽略/延后的原因（自由文本，可空） */
  reason?: string | null;
  actor: string;
  requestKey: string;
  now: Date;
};

export type ReminderDispositionResult = {
  actionId: string;
  disposition: ReminderDisposition;
  /** 被处置的发生记录（没有到期记录时为 null：忽略已不存在的到期） */
  occurrenceId: string | null;
  occurrenceOutcome: ReminderOutcome | null;
  /** 延后后的新到期瞬时；其它处置沿用原到期 */
  dueAt: Date | null;
  /** 幂等重放：本次请求键此前已执行，未产生第二次副作用 */
  replayed: boolean;
};

/**
 * 处置的原子出口（O03）。
 *
 * 为什么单独定端口而不是塞进 OperationsJournalPort：既有事务视图只暴露 runs/grants/appendAudit，
 * 不含 Action 与 ReminderOccurrence。处置必须让「发生记录结果 + Action 改期 + 审计」同事务提交——
 * 否则中途失败会留下「提醒已标记处理、事项却仍指向旧到期」的半截状态。
 */
export interface ReminderDispositionPort {
  dispose(input: ReminderDispositionInput): Promise<ReminderDispositionResult>;
  /** 该请求键是否已执行过（用于幂等判断与结果回放） */
  findByRequestKey(requestKey: string): Promise<ReminderDispositionResult | null>;
}

/**
 * 处置审计的稳定标识（adapter 写入、service 读取共用同一份）。
 * 读取时必须按 action 过滤：auditRecord 是通用表，将来别的功能也会审计同一 targetId。
 */
export const REMINDER_DISPOSITION_AUDIT_TARGET_TYPE = 'action';
export const REMINDER_DISPOSITION_AUDIT_ACTION = 'reminder.disposition';

export const REMINDER_DISPOSITION = Symbol('REMINDER_DISPOSITION');
