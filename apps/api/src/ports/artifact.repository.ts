export interface OriginalFileInput {
  originalName: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
  role: 'draft' | 'attachment';
}

export interface OriginalFileRecord {
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
  role: 'draft' | 'attachment';
}

export interface WorkManifest {
  workId: string;
  version: 1;
  originalCreatedAt: string;
  originalFiles: OriginalFileRecord[];
}

export interface ArtifactRepositoryPort {
  createOriginal(workId: string, files: OriginalFileInput[]): Promise<WorkManifest>;
  readManifest(workId: string): Promise<WorkManifest | null>;
  discardWork(workId: string): Promise<void>;
  readOriginalText?(workId: string): Promise<string>;
}

export const ARTIFACT_REPOSITORY = Symbol('ARTIFACT_REPOSITORY');
