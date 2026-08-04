import type {
  ActionEntityType,
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
  completedAt: Date | null;
  source: ActionSource;
  createdAt: Date;
  updatedAt: Date;
}

export type NewActionRecord = Omit<
  ActionRecord,
  'createdAt' | 'updatedAt' | 'completedAt' | 'status'
>;

export interface ActionRepositoryPort {
  create(input: NewActionRecord): Promise<ActionRecord>;
  ensureOpenForEntity(input: NewActionRecord): Promise<ActionRecord>;
  findById(id: string): Promise<ActionRecord | null>;
  list(input: { status?: ActionStatus; kind?: ActionKind; limit: number }): Promise<ActionRecord[]>;
  update(id: string, input: { title?: string; note?: string | null; plannedDate?: string | null }): Promise<ActionRecord>;
  setCompletion(id: string, input: { status: ActionStatus; completedAt: Date | null }): Promise<ActionRecord>;
}

export const ACTION_REPOSITORY = Symbol('ACTION_REPOSITORY');
