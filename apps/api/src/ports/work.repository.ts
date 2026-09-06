import type { ContentBrief, ProductionStage, WorkStatus } from '@walker/shared';

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
  currentStage: ProductionStage | null;
  stageStartedAt: Date | null;
  lastOutputAt: Date | null;
  waitingReason: string | null;
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
  setStatus?(id: string, status: WorkStatus, approvedArtifactHash?: string | null): Promise<WorkRecord>;
  /**
   * 条件状态更新：当前状态命中 unless 时跳过写入并返回现状（迟到结果不得覆盖终态，
   * 如取消后完成的生产循环不得把 CANCELLED 改写成 REVIEW_READY）。返回 null 表示 work 不存在。
   */
  setStatusUnless?(id: string, unless: readonly WorkStatus[], status: WorkStatus, approvedArtifactHash?: string | null): Promise<WorkRecord | null>;
  setProgress?(id: string, input: {
    currentStage?: ProductionStage | null;
    stageStartedAt?: Date | null;
    lastOutputAt?: Date | null;
    waitingReason?: string | null;
  }): Promise<WorkRecord>;
}

export const WORK_REPOSITORY = Symbol('WORK_REPOSITORY');
