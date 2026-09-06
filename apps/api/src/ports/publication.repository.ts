export type PublicationChannel = 'WEBSITE' | 'WECHAT';
/**
 * 网站发布状态链：PREPARED（内容文件已落盘，待 pnpm content:publish 上线）
 * → PUBLISHING（git 已推送，等待 Vercel）→ PUBLISHED（线上校验通过）/ FAILED。
 * 保存文件≠已发布：verifyWebsite 通过之前不声称 PUBLISHED。
 */
export type PublicationStatus = 'PENDING' | 'PREPARED' | 'PUBLISHING' | 'PUBLISHED' | 'WAITING_USER' | 'FAILED';

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
