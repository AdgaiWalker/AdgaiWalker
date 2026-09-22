import type { PublicSnapshotItem } from '@walker/shared';

export type VerifiedPublicSnapshot = {
  buildId: string;
  collectionHash: string;
  items: Array<PublicSnapshotItem & { hash: string }>;
};

export interface PublicSnapshotRepositoryPort {
  publish(snapshot: VerifiedPublicSnapshot): Promise<void>;
  readActive(): Promise<VerifiedPublicSnapshot>;
}

export const PUBLIC_SNAPSHOT_REPOSITORY = Symbol('PUBLIC_SNAPSHOT_REPOSITORY');
