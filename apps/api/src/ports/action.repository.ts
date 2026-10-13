import type {
  ActionEntityType,
  ActionEvidenceRef,
  ActionKind,
  ActionSource,
  ActionStatus,
} from '@walker/shared';

export interface ActionRecord {
  id: string;
  title: string;
  note: string | null;
  kind: ActionKind;
  entityType: ActionEntityType | null;
  entityId: string | null;
  status: ActionStatus;
  plannedDate: string | null;
  /** 到期 UTC 瞬时；未排期为 null */
  dueAt: Date | null;
  /** 生成 dueAt 所用 IANA 时区；旧行为 null（不反推） */
  timezone: string | null;
  completedAt: Date | null;
  source: ActionSource;
  /** O05：访客问题转事项的证据软引用；非会话来源为 null */
  evidenceRef: ActionEvidenceRef | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 新建事项的入参。
 * `evidenceRef` 可选：只有「访客问题转事项」（O05）才带证据引用，
 * 其余调用方（系统提示、内容排期、反馈转事项）不传即不写这一列。
 */
export type NewActionRecord = Omit<
  ActionRecord,
  'createdAt' | 'updatedAt' | 'completedAt' | 'status' | 'evidenceRef'
> & { evidenceRef?: ActionEvidenceRef | null };

export interface ActionRepositoryPort {
  create(input: NewActionRecord): Promise<ActionRecord>;
  ensureOpenForEntity(input: NewActionRecord): Promise<ActionRecord>;
  findById(id: string): Promise<ActionRecord | null>;
  list(input: { status?: ActionStatus; kind?: ActionKind; limit: number }): Promise<ActionRecord[]>;
  /** 到期未完成事项（O02 扫描用）：dueAt 非空且 <= before，状态为 OPEN */
  listDue(before: Date, limit: number): Promise<ActionRecord[]>;
  update(id: string, input: { title?: string; note?: string | null; plannedDate?: string | null; dueAt?: Date | null; timezone?: string | null; entityType?: ActionEntityType | null; entityId?: string | null }): Promise<ActionRecord>;
  setCompletion(id: string, input: { status: ActionStatus; completedAt: Date | null }): Promise<ActionRecord>;
  /** 删除一条排期；只动 Action 行，与内容文件无关（PRD §4.4 末条） */
  delete(id: string): Promise<void>;
}

export const ACTION_REPOSITORY = Symbol('ACTION_REPOSITORY');
