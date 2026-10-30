import type { PublishedPostRequiredField } from './content.js';

/** ContentChange only describes an approved file mutation. A saved candidate is never a release. */
export const CONTENT_CHANGE_STATES = [
  'PROPOSED', 'APPROVED', 'APPLYING', 'APPLIED', 'REJECTED', 'EXPIRED', 'CONFLICT', 'UNKNOWN',
] as const;
export type ContentChangeState = (typeof CONTENT_CHANGE_STATES)[number];

/** The website and assistant index are separate approval targets and version facts. */
export const CONTENT_APPROVAL_ACTIONS = ['apply-candidate', 'publish-website'] as const;
export type ContentApprovalAction = (typeof CONTENT_APPROVAL_ACTIONS)[number];

export type ContentTarget = {
  kind: 'content';
  slug: string;
};

export type ContentSha256 = string;

export interface ContentApprovalBinding {
  action: ContentApprovalAction;
  target: ContentTarget;
  baseHash: ContentSha256;
  candidateHash: ContentSha256;
  grantId: string;
  grantRevision: number;
}

/** An immutable owner decision over one exact action, object version, candidate, and grant revision. */
export interface ContentApproval<Action extends ContentApprovalAction = ContentApprovalAction> {
  id: string;
  binding: ContentApprovalBinding & { action: Action };
  bindingHash: ContentSha256;
  approvedBy: string;
  approvedAt: string;
}

export interface ContentChange {
  id: string;
  action: 'apply-candidate';
  target: ContentTarget;
  baseHash: ContentSha256;
  candidateHash: ContentSha256;
  /** Opaque server-issued artifact reference; never a filesystem path. */
  candidateRef: string;
  sourceRunId: string | null;
  state: ContentChangeState;
  applyApproval: ContentApproval<'apply-candidate'> | null;
  appliedHash: ContentSha256 | null;
  requestKey: string;
  createdAt: string;
  updatedAt: string;
}

export type ContentChangeView = ContentChange & {
  candidateRaw?: string | null;
};

export const CONTENT_RELEASE_STAGES = [
  'PREPARED', 'COMMITTING', 'PUSHED', 'VERIFYING', 'PUBLISHED', 'FAILED', 'UNKNOWN',
] as const;
export type ContentReleaseStage = (typeof CONTENT_RELEASE_STAGES)[number];

export const CONTENT_INDEX_SYNC_STATES = ['PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'UNKNOWN'] as const;
export type ContentIndexSyncState = (typeof CONTENT_INDEX_SYNC_STATES)[number];

const CONTENT_CHANGE_TRANSITIONS: Record<ContentChangeState, readonly ContentChangeState[]> = {
  PROPOSED: ['APPROVED', 'REJECTED', 'EXPIRED', 'CONFLICT'],
  APPROVED: ['APPLYING', 'REJECTED', 'EXPIRED', 'CONFLICT'],
  APPLYING: ['APPLIED', 'CONFLICT', 'UNKNOWN'],
  APPLIED: [],
  REJECTED: [],
  EXPIRED: [],
  CONFLICT: [],
  UNKNOWN: [],
};

const CONTENT_RELEASE_TRANSITIONS: Record<ContentReleaseStage, readonly ContentReleaseStage[]> = {
  PREPARED: ['COMMITTING', 'FAILED', 'UNKNOWN'],
  COMMITTING: ['PUSHED', 'FAILED', 'UNKNOWN'],
  PUSHED: ['VERIFYING', 'FAILED', 'UNKNOWN'],
  VERIFYING: ['PUBLISHED', 'FAILED', 'UNKNOWN'],
  PUBLISHED: [],
  FAILED: [],
  UNKNOWN: ['VERIFYING', 'FAILED'],
};

const CONTENT_APPROVAL_BINDING_KEYS = new Set([
  'action', 'target', 'baseHash', 'candidateHash', 'grantId', 'grantRevision',
]);

export interface ContentRelease {
  id: string;
  changeId: string;
  action: 'publish-website';
  target: ContentTarget;
  /** Currently verified website version being replaced. */
  baseHash: ContentSha256;
  /** Candidate content hash approved for the new website release. */
  sourceHash: ContentSha256;
  publishApproval: ContentApproval<'publish-website'>;
  stage: ContentReleaseStage;
  /** Index projection is tracked independently from the verified website release stage. */
  assistantIndexState: ContentIndexSyncState;
  manifestHash: ContentSha256 | null;
  /** Opaque immutable manifest reference; the stored value is never a filesystem path. */
  manifestRef: string | null;
  gitCommit: string | null;
  publishedSnapshotId: string | null;
  verifiedHash: ContentSha256 | null;
  verifiedAt: string | null;
  errorCode: string | null;
  /** 变更说明（文章版本历史的「为什么」，发布确证时固化为一条公开版本） */
  versionNote?: string | null;
  requestKey: string;
  createdAt: string;
  updatedAt: string;
}

/** Read model: the three versions come from distinct authoritative sources. */
export interface ContentVersionSnapshot {
  workingHash: ContentSha256 | null;
  publishedHash: ContentSha256 | null;
  indexedHash: ContentSha256 | null;
}

export interface ReleaseManifestItem {
  path: string;
  slug?: string;
  hash: string;
  kind: 'content' | 'support-config' | 'generated' | 'code' | 'other';
  status: 'modified' | 'added' | 'deleted' | 'untracked';
}

export interface ReleaseManifest {
  targetSlug: string;
  targetHash: string;
  headCommit: string | null;
  manifestHash: string;
  items: ReleaseManifestItem[];
  createdAt: string;
}

export interface ReleaseScopeConflict {
  reason: 'other-content-dirty' | 'support-config-dirty' | 'code-dirty' | 'git-unavailable';
  message: string;
  details: string[];
}

export interface ReleasePreflightResult {
  ok: boolean;
  missing: PublishedPostRequiredField[];
  targetSlug?: string;
  targetHash?: string | null;
  /** Hash of the public projection, distinct from the working file hash. */
  publicHash?: string | null;
  manifest?: ReleaseManifest | null;
  scopeConflict?: ReleaseScopeConflict | null;
}

export interface ReleaseResult {
  runId: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
}

export interface ReleaseVerificationResult {
  releaseId: string;
  stage: ContentReleaseStage;
  assistantIndexState?: ContentIndexSyncState;
  publishedSnapshotId?: string | null;
  verified: boolean;
  verifiedHash: string | null;
  reason: string | null;
}

export type ReleaseReconcileNextAction =
  | 'wait-run'
  | 'wait-deployment'
  | 'check-git-remote'
  | 'retry-verify'
  | 'none';

export interface ReleaseReconcileResult {
  releaseId: string;
  previousStage: ContentReleaseStage;
  currentStage: ContentReleaseStage;
  resolved: boolean;
  nextAction: ReleaseReconcileNextAction;
  details: string;
  verifiedHash?: string | null;
  gitCommit?: string | null;
}

export interface ReleaseCancelResult {
  releaseId: string;
  cancelled: boolean;
  stage: ContentReleaseStage;
  message: string;
}

export function isContentSha256(value: unknown): value is ContentSha256 {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function isContentTarget(value: unknown): value is ContentTarget {
  return isRecord(value) && Object.keys(value).every((key) => key === 'kind' || key === 'slug') &&
    value.kind === 'content' && isContentSlug(value.slug);
}

export function isContentOpaqueId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
}

export function isContentChangeState(value: unknown): value is ContentChangeState {
  return typeof value === 'string' && (CONTENT_CHANGE_STATES as readonly string[]).includes(value);
}

export function isContentReleaseStage(value: unknown): value is ContentReleaseStage {
  return typeof value === 'string' && (CONTENT_RELEASE_STAGES as readonly string[]).includes(value);
}

export function isContentIndexSyncState(value: unknown): value is ContentIndexSyncState {
  return typeof value === 'string' && (CONTENT_INDEX_SYNC_STATES as readonly string[]).includes(value);
}

export function isContentChangeTransitionAllowed(
  from: ContentChangeState,
  to: ContentChangeState,
): boolean {
  return CONTENT_CHANGE_TRANSITIONS[from].includes(to);
}

export function isContentApprovalBinding(value: unknown): value is ContentApprovalBinding {
  if (!isRecord(value) || Object.keys(value).some((key) => !CONTENT_APPROVAL_BINDING_KEYS.has(key))) return false;
  const action = value.action;
  return (CONTENT_APPROVAL_ACTIONS as readonly unknown[]).includes(action) &&
    isContentTarget(value.target) &&
    isContentSha256(value.baseHash) && isContentSha256(value.candidateHash) &&
    value.baseHash !== value.candidateHash &&
    isContentOpaqueId(value.grantId) && Number.isInteger(value.grantRevision) && Number(value.grantRevision) >= 1;
}

/** Canonical bytes used by the API to hash an approval binding; field order is fixed here once. */
export function contentApprovalBindingKey(binding: ContentApprovalBinding): string {
  return JSON.stringify([
    binding.action,
    binding.target.kind,
    binding.target.slug,
    binding.baseHash,
    binding.candidateHash,
    binding.grantId,
    binding.grantRevision,
  ]);
}

export function contentApprovalBindingMatches(
  approved: unknown,
  current: unknown,
): boolean {
  return isContentApprovalBinding(approved) && isContentApprovalBinding(current) &&
    contentApprovalBindingKey(approved) === contentApprovalBindingKey(current);
}

/** Normal execution cannot skip publication stages; reconciliation owns UNKNOWN resolution. */
export function isContentReleaseTransitionAllowed(
  from: ContentReleaseStage,
  to: ContentReleaseStage,
  verification?: { expectedHash: unknown; verifiedHash: unknown },
): boolean {
  if (to === 'PUBLISHED') {
    if ((from !== 'VERIFYING' && from !== 'UNKNOWN') || !verification) return false;
    return isContentSha256(verification.expectedHash) && isContentSha256(verification.verifiedHash) &&
      verification.expectedHash === verification.verifiedHash;
  }
  return CONTENT_RELEASE_TRANSITIONS[from].includes(to);
}

/** PUBLISHED requires online proof of the exact candidate hash, after VERIFYING. */
export function canMarkContentReleasePublished(
  stage: ContentReleaseStage,
  expectedHash: unknown,
  verifiedHash: unknown,
): boolean {
  return isContentReleaseTransitionAllowed(stage, 'PUBLISHED', { expectedHash, verifiedHash });
}

function isContentSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 &&
    /^[a-zA-Z0-9_/-]+$/.test(value) && !value.includes('..');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
