import type { CluePoolStatus, InterestLevel, SeedLinkRole, TopicStatus } from '@walker/shared';

export interface SeedLinkRecord {
  clueId: string;
  role: SeedLinkRole;
  poolStatus: CluePoolStatus;
}

export interface SeedRecord {
  id: string;
  title: string;
  severity: InterestLevel | null;
  selfInterest: InterestLevel | null;
  primaryClueId: string | null;
  workflowStatus: TopicStatus;
  whyNow: string | null;
  links: SeedLinkRecord[];
  createdAt: Date;
}

export interface SeedRepositoryPort {
  create(input: {
    id: string;
    title: string;
    severity?: InterestLevel | null;
    selfInterest?: InterestLevel | null;
  }): Promise<SeedRecord>;
  findById(id: string): Promise<SeedRecord | null>;
  list(limit: number): Promise<SeedRecord[]>;
  linkClue(input: {
    id: string;
    seedId: string;
    clueId: string;
    role: SeedLinkRole;
  }): Promise<void>;
  setPrimary(seedId: string, clueId: string): Promise<SeedRecord>;
  updateTwoQuestions(
    seedId: string,
    q: { severity: InterestLevel; selfInterest: InterestLevel },
  ): Promise<SeedRecord>;
  updateTopic(
    id: string,
    input: { title?: string; workflowStatus?: TopicStatus; whyNow?: string | null },
  ): Promise<SeedRecord>;
}

export const SEED_REPOSITORY = Symbol('SEED_REPOSITORY');
