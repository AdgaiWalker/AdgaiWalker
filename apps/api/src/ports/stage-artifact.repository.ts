import type { ProductionStage, StageArtifact } from '@walker/shared';

export interface StageArtifactRecord {
  workId: string;
  stage: ProductionStage;
  hash: string;
  path: string;
  artifact: StageArtifact;
  createdAt: string;
}

export interface StageArtifactRepositoryPort {
  write(workId: string, artifact: StageArtifact): Promise<StageArtifactRecord>;
  latest(workId: string, stage: ProductionStage): Promise<StageArtifactRecord | null>;
  list(workId: string): Promise<StageArtifactRecord[]>;
}

export const STAGE_ARTIFACT_REPOSITORY = Symbol('STAGE_ARTIFACT_REPOSITORY');
