import type { ContentBrief, WorkStatus } from '@walker/shared';

export interface WorkRecord {
  id: string;
  executionId: string;
  idempotencyKey: string;
  title: string;
  status: WorkStatus;
  manifestPath: string;
  coreViewpoint: string;
  protectedClaims: string[];
  approvedArtifactHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewWorkRecord {
  id: string;
  executionId: string;
  idempotencyKey: string;
  title: string;
  manifestPath: string;
  coreViewpoint: string;
  protectedClaims: string[];
}

export interface NewManualWorkRecord {
  id: string;
  idempotencyKey: string;
  title: string;
  sourceProblem: string;
  whyNow: string;
  contentBrief: ContentBrief;
  coreViewpoint: string;
  protectedClaims: string[];
  manifestPath: string;
}

export interface WorkRepositoryPort {
  findById(id: string): Promise<WorkRecord | null>;
  findByIdempotencyKey(key: string): Promise<WorkRecord | null>;
  list(limit: number): Promise<WorkRecord[]>;
  createForExecution(input: NewWorkRecord): Promise<WorkRecord>;
  createFromDraft(input: NewManualWorkRecord): Promise<WorkRecord>;
}

export const WORK_REPOSITORY = Symbol('WORK_REPOSITORY');
