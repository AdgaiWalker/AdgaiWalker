import type { ReviewEvidenceState } from '@walker/shared';

export interface ReviewEntryRecord {
  id: string;
  actionId: string;
  releaseId: string | null;
  didWhat: string;
  observed: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  nextAttempt: string | null;
  evidenceState: ReviewEvidenceState;
  evidenceNote: string | null;
  createdBy: string;
  requestKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NewReviewEntry = Omit<ReviewEntryRecord, 'createdAt' | 'updatedAt'>;

export interface ReviewEntryRepositoryPort {
  /** 按 requestKey 幂等创建：重复提交返回同一记录（复盘不会因重复点击产生两条） */
  createOnce(input: NewReviewEntry): Promise<ReviewEntryRecord>;
  findById(id: string): Promise<ReviewEntryRecord | null>;
  findByRequestKey(requestKey: string): Promise<ReviewEntryRecord | null>;
  list(input: { actionId?: string; limit: number }): Promise<ReviewEntryRecord[]>;
}

export const REVIEW_ENTRY_REPOSITORY = Symbol('REVIEW_ENTRY_REPOSITORY');
