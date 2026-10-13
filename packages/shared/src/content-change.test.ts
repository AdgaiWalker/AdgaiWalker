import { describe, expect, it } from 'vitest';
import * as shared from './index.js';
import type {
  ContentApproval,
  ContentApprovalBinding,
  ContentChange,
  ContentRelease,
  ContentVersionSnapshot,
} from './content-change.js';

const exported = shared as unknown as Record<string, unknown>;

function runBoolean(name: string, ...args: unknown[]): boolean {
  const candidate = exported[name];
  expect(candidate, `shared contract must export ${name}`).toBeTypeOf('function');
  if (typeof candidate !== 'function') return false;
  return (candidate as (...values: unknown[]) => boolean)(...args);
}

describe('内容候选与发布合同', () => {
  it('只接受规范的 SHA-256 内容版本 hash', () => {
    expect(runBoolean('isContentSha256', 'a'.repeat(64))).toBe(true);
    expect(runBoolean('isContentSha256', 'A'.repeat(64))).toBe(false);
    expect(runBoolean('isContentSha256', 'z'.repeat(64))).toBe(false);
    expect(runBoolean('isContentSha256', 'a'.repeat(63))).toBe(false);
    expect(runBoolean('isContentTarget', { kind: 'content', slug: 'post-a' })).toBe(true);
    expect(runBoolean('isContentTarget', { kind: 'content', slug: '../outside' })).toBe(false);
    expect(runBoolean('isContentOpaqueId', '../private/path')).toBe(false);
  });

  it('审批绑定候选、动作、目标和授权修订，任一变化都必须失效', () => {
    const binding = {
      action: 'apply-candidate',
      target: { kind: 'content', slug: 'post-a' },
      baseHash: 'a'.repeat(64), candidateHash: 'b'.repeat(64),
      grantId: 'grant-a', grantRevision: 2,
    };
    const changes = [
      { ...binding, action: 'publish-website' },
      { ...binding, target: { kind: 'content', slug: 'post-b' } },
      { ...binding, baseHash: 'c'.repeat(64) },
      { ...binding, candidateHash: 'd'.repeat(64) },
      { ...binding, grantId: 'grant-b' },
      { ...binding, grantRevision: 3 },
    ];

    expect(runBoolean('contentApprovalBindingMatches', binding, binding)).toBe(true);
    for (const changed of changes) {
      expect(runBoolean('contentApprovalBindingMatches', binding, changed)).toBe(false);
    }
    expect(runBoolean('contentApprovalBindingMatches', binding, { ...binding, force: true })).toBe(false);
    expect(runBoolean('isContentApprovalBinding', { ...binding, baseHash: binding.candidateHash })).toBe(false);
  });

  it('编辑状态不包含 PUBLISHED，发布必须依次经过线上核验', () => {
    const hash = 'e'.repeat(64);
    expect(runBoolean('isContentChangeState', 'APPLIED')).toBe(true);
    expect(runBoolean('isContentChangeState', 'PUBLISHED')).toBe(false);
    expect(runBoolean('isContentReleaseTransitionAllowed', 'PREPARED', 'COMMITTING')).toBe(true);
    expect(runBoolean('isContentReleaseTransitionAllowed', 'PREPARED', 'PUBLISHED')).toBe(false);
    expect(runBoolean('isContentReleaseTransitionAllowed', 'PUSHED', 'PUBLISHED')).toBe(false);
    expect(runBoolean('isContentReleaseTransitionAllowed', 'VERIFYING', 'PUBLISHED')).toBe(false);
    expect(runBoolean('isContentReleaseTransitionAllowed', 'VERIFYING', 'PUBLISHED', { expectedHash: hash, verifiedHash: hash })).toBe(true);
    expect(runBoolean('isContentReleaseTransitionAllowed', 'VERIFYING', 'PUBLISHED', { expectedHash: hash, verifiedHash: 'f'.repeat(64) })).toBe(false);
    expect(runBoolean('canMarkContentReleasePublished', 'VERIFYING', hash, hash)).toBe(true);
    expect(runBoolean('canMarkContentReleasePublished', 'VERIFYING', hash, 'f'.repeat(64))).toBe(false);
    expect(runBoolean('canMarkContentReleasePublished', 'COMMITTING', hash, hash)).toBe(false);
    expect(runBoolean('isContentReleaseTransitionAllowed', 'UNKNOWN', 'VERIFYING')).toBe(true);
    expect(runBoolean('isContentReleaseTransitionAllowed', 'UNKNOWN', 'FAILED')).toBe(true);
    expect(runBoolean('isContentReleaseTransitionAllowed', 'UNKNOWN', 'PUBLISHED', { expectedHash: hash, verifiedHash: hash })).toBe(true);
    expect(runBoolean('isContentReleaseTransitionAllowed', 'UNKNOWN', 'PUBLISHED')).toBe(false);
    expect(runBoolean('isContentChangeTransitionAllowed', 'PROPOSED', 'APPROVED')).toBe(true);
    expect(runBoolean('isContentChangeTransitionAllowed', 'PROPOSED', 'APPLIED')).toBe(false);
    expect(runBoolean('isContentChangeTransitionAllowed', 'APPLIED', 'PUBLISHED')).toBe(false);
  });

  it('按工作区、已核验网页和问答索引分别表达版本 hash', () => {
    expect(runBoolean('isContentIndexSyncState', 'SYNCED')).toBe(true);
    expect(runBoolean('isContentIndexSyncState', 'PUBLISHED')).toBe(false);
    const versions: ContentVersionSnapshot = {
      workingHash: '1'.repeat(64), publishedHash: '2'.repeat(64), indexedHash: '3'.repeat(64),
    };
    expect(new Set(Object.values(versions)).size).toBe(3);
  });

  it('为候选应用和网站发布保留不同的审批与发布合同', () => {
    const target = { kind: 'content' as const, slug: 'post-a' };
    const baseHash = '1'.repeat(64);
    const candidateHash = '2'.repeat(64);
    const binding = <Action extends ContentApprovalBinding['action']>(action: Action): ContentApprovalBinding & { action: Action } => ({
      action, target, baseHash, candidateHash, grantId: 'grant-a', grantRevision: 2,
    });
    const applyApproval: ContentApproval<'apply-candidate'> = {
      id: 'approval-apply', binding: binding('apply-candidate'), bindingHash: '3'.repeat(64),
      approvedBy: 'owner', approvedAt: '2026-09-25T00:00:00.000Z',
    };
    const publishApproval: ContentApproval<'publish-website'> = {
      id: 'approval-publish', binding: binding('publish-website'), bindingHash: '4'.repeat(64),
      approvedBy: 'owner', approvedAt: '2026-09-25T00:00:00.000Z',
    };
    const change: ContentChange = {
      id: 'change-a', action: 'apply-candidate', target, baseHash, candidateHash,
      candidateRef: 'candidate-a', sourceRunId: null, state: 'APPROVED',
      applyApproval, appliedHash: null, requestKey: 'change-request-a',
      createdAt: '2026-09-25T00:00:00.000Z', updatedAt: '2026-09-25T00:00:00.000Z',
    };
    const release: ContentRelease = {
      id: 'release-a', changeId: change.id, action: 'publish-website', target,
      baseHash, sourceHash: candidateHash, publishApproval, stage: 'PREPARED', assistantIndexState: 'PENDING',
      manifestHash: null, manifestRef: null, gitCommit: null, publishedSnapshotId: null,
      verifiedHash: null, verifiedAt: null, errorCode: null,
      requestKey: 'release-request-a', createdAt: '2026-09-25T00:00:00.000Z',
      updatedAt: '2026-09-25T00:00:00.000Z',
    };
    expect(change.applyApproval?.binding.action).toBe('apply-candidate');
    expect(release.publishApproval.binding.action).toBe('publish-website');
    expect(release.stage).toBe('PREPARED');
  });
});
