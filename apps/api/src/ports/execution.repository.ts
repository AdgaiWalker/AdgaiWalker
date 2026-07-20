import type { DeliveryForm, ReviewOutcome } from '@walker/shared';

export interface ExecutionRecord {
  id: string;
  seedId: string;
  status: string;
  deliveryUrl: string | null;
  deliveryForm: string | null;
  deliveryNote: string | null;
  outcome: string | null;
  evidence: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExecutionRepositoryPort {
  create(input: { id: string; seedId: string }): Promise<ExecutionRecord>;
  findById(id: string): Promise<ExecutionRecord | null>;
  list(limit: number): Promise<ExecutionRecord[]>;
  deliver(
    id: string,
    input: {
      url?: string | null;
      form?: DeliveryForm | null;
      note?: string | null;
    },
  ): Promise<ExecutionRecord>;
  review(
    id: string,
    input: { outcome: ReviewOutcome; evidence?: string | null },
  ): Promise<ExecutionRecord>;
}

export const EXECUTION_REPOSITORY = Symbol('EXECUTION_REPOSITORY');
