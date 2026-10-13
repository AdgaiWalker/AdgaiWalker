import type {
  ContentApproval,
  ContentIndexSyncState,
  ContentRelease,
  ContentReleaseStage,
  ContentTarget,
} from '@walker/shared';

export const CONTENT_RELEASE_REPOSITORY = Symbol('CONTENT_RELEASE_REPOSITORY');

export type NewContentRelease = {
  id: string;
  changeId: string;
  target: ContentTarget;
  baseHash: string;
  /** 公开版本身份：线上 content-hash 与 public-manifest 条目 hash 的同一口径。 */
  sourceHash: string;
  publishApproval: ContentApproval<'publish-website'>;
  requestKey: string;
};

export type UpdateContentReleaseStageInput = {
  id: string;
  stage: ContentReleaseStage;
  gitCommit?: string | null;
  manifestHash?: string | null;
  errorCode?: string | null;
  verifiedHash?: string | null;
  verifiedAt?: string | null;
  assistantIndexState?: ContentIndexSyncState;
  publishedSnapshotId?: string | null;
};

export type UpdateContentReleaseIndexInput = {
  id: string;
  assistantIndexState: ContentIndexSyncState;
  publishedSnapshotId?: string | null;
};

export interface ContentReleaseRepositoryPort {
  /** Creates only PREPARED releases. A request-key retry returns the same release. */
  createOnce(input: NewContentRelease): Promise<ContentRelease>;
  findById(id: string): Promise<ContentRelease | null>;
  findByRequestKey(requestKey: string): Promise<ContentRelease | null>;
  listForChange(changeId: string): Promise<ContentRelease[]>;
  updateStage(input: UpdateContentReleaseStageInput): Promise<ContentRelease>;
  updateIndexState(input: UpdateContentReleaseIndexInput): Promise<ContentRelease>;
  findLatestForTarget(slug: string): Promise<ContentRelease | null>;
  findLatestPublishedForTarget(slug: string): Promise<ContentRelease | null>;
  /**
   * 每个 target 的最新发布（概览一次性取全，避免逐 slug N+1）。
   * 只返回每个 slug 的最新一条，与 findLatestForTarget 同口径。
   */
  listLatestPerTarget(): Promise<ContentRelease[]>;
  /** 每个 target 最近一次已确证发布；较新的失败或 UNKNOWN 不覆盖它。 */
  listLatestPublishedPerTarget(): Promise<ContentRelease[]>;
}
