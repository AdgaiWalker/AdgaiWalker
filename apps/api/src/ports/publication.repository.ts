export type PublicationChannel = 'WEBSITE' | 'WECHAT';
export type PublicationStatus = 'PENDING' | 'PUBLISHING' | 'PUBLISHED' | 'WAITING_USER' | 'FAILED';

export interface PublicationRecord {
  id: string;
  submissionId: string;
  channel: PublicationChannel;
  artifactHash: string;
  status: PublicationStatus;
  url: string | null;
  lastError: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicationRepositoryPort {
  find(submissionId: string, channel: PublicationChannel): Promise<PublicationRecord | null>;
  upsert(input: { id: string; submissionId: string; channel: PublicationChannel; artifactHash: string; status: PublicationStatus; url?: string | null; lastError?: string | null; publishedAt?: Date | null }): Promise<PublicationRecord>;
  list(submissionId: string): Promise<PublicationRecord[]>;
}

export const PUBLICATION_REPOSITORY = Symbol('PUBLICATION_REPOSITORY');
