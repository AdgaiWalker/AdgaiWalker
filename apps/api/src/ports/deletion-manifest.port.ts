export const DELETION_MANIFEST = Symbol('DELETION_MANIFEST');

export type DeletionManifestEntry = {
  tombstoneId: string;
  conversationId: string;
  requestedAt: string;
};

export interface DeletionManifestPort {
  health(): Promise<void>;
  record(entry: DeletionManifestEntry): Promise<void>;
  recordMany(entries: DeletionManifestEntry[]): Promise<void>;
  entries(): Promise<DeletionManifestEntry[]>;
}
