import type { ReminderOutcome } from '@walker/shared';

export interface ReminderOccurrenceRecord {
  id: string;
  actionId: string;
  dedupeKey: string;
  dueAt: Date;
  timezone: string;
  outcome: ReminderOutcome;
  reason: string | null;
  notifiedAt: Date;
  resolvedAt: Date | null;
  createdAt: Date;
}

export type NewReminderOccurrence = {
  id: string;
  actionId: string;
  dedupeKey: string;
  dueAt: Date;
  timezone: string;
};

export interface ReminderOccurrenceRepositoryPort {
  /**
   * 按 dedupeKey 幂等创建：已存在则返回既有记录并置 created=false。
   * 唯一键是去重的**唯一**保证——重复扫描不得产生第二条发生记录。
   */
  createOnce(input: NewReminderOccurrence): Promise<{ record: ReminderOccurrenceRecord; created: boolean }>;
  findById(id: string): Promise<ReminderOccurrenceRecord | null>;
  findByDedupeKey(dedupeKey: string): Promise<ReminderOccurrenceRecord | null>;
  /** 该事项最近一条发生记录（用于处置时定位当前到期） */
  findLatestForAction(actionId: string): Promise<ReminderOccurrenceRecord | null>;
  listForAction(actionId: string): Promise<ReminderOccurrenceRecord[]>;
  /** 处置到期：写入结果、可选原因与解析时间 */
  resolve(input: {
    id: string;
    outcome: ReminderOutcome;
    reason?: string | null;
    resolvedAt: Date;
  }): Promise<ReminderOccurrenceRecord>;
}

export const REMINDER_OCCURRENCE_REPOSITORY = Symbol('REMINDER_OCCURRENCE_REPOSITORY');
