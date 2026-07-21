import type { CluePoolStatus, ClueSource } from '@walker/shared';

export interface ClueRecord {
  id: string;
  body: string;
  source: ClueSource;
  poolStatus: CluePoolStatus;
  anonId: string | null;
  createdAt: Date;
}

export interface ClueRepositoryPort {
  create(input: {
    id: string;
    body: string;
    source: ClueSource;
    poolStatus: CluePoolStatus;
    anonId: string | null;
  }): Promise<ClueRecord>;
  list(limit: number): Promise<ClueRecord[]>;
  findById(id: string): Promise<ClueRecord | null>;
  updatePoolStatus(id: string, poolStatus: CluePoolStatus): Promise<ClueRecord>;
}

export const CLUE_REPOSITORY = Symbol('CLUE_REPOSITORY');
