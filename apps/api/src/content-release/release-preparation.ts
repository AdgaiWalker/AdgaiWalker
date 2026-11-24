import { HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  grantAllows,
  requireVersionNote,
  type ContentApproval,
  type ContentChange,
  type ContentRelease,
  type ReleasePreflightResult,
} from '@walker/shared';
import { contentApprovalHash } from '../adapters/content-approval.persistence';
import { sha256Hex } from '../common/crypto';
import { ApiError, validationError } from '../common/http-error';
import type { AuthorizationRepositoryPort } from '../ports/authorization.repository';
import type { ContentChangeRepositoryPort } from '../ports/content-change.repository';
import type { ContentFileRepositoryPort } from '../ports/content-file.repository';
import type { ContentLedgerRepositoryPort } from '../ports/content-ledger.repository';
import type { ContentReleaseRepositoryPort } from '../ports/content-release.repository';
import type { OperationsJournalPort } from '../ports/operations-journal.port';
import { readContentVersionSnapshot, runReleasePreflight, type ReleasePreflightDeps } from './release-preflight';

/** 统一校验发布授权是否有效、修订一致且包含当前文章 */
function requireAllowedPublishGrant(
  grant: Awaited<ReturnType<AuthorizationRepositoryPort['find']>> | undefined,
  options: { slug: string; actor: string; expectedRevision?: number; message: string },
) {
  if (
    !grant ||
    (options.expectedRevision !== undefined && grant.revision !== options.expectedRevision) ||
    !grant.agentId ||
    !grantAllows(grant, {
      origin: 'admin',
      principalType: 'owner',
      principalId: options.actor,
      agentId: grant.agentId,
      action: 'content:publish',
      resourceKind: 'content',
      resourceId: options.slug,
      now: Date.now(),
    })
  ) {
    throw new ApiError('grant-denied', 403, options.message);
  }
  return grant;
}

export interface ReleasePreparationDeps extends ReleasePreflightDeps {
  releasesRepo?: ContentReleaseRepositoryPort;
  changesRepo?: ContentChangeRepositoryPort;
  files?: ContentFileRepositoryPort;
  entries: ContentLedgerRepositoryPort;
  grants?: AuthorizationRepositoryPort;
  journal?: OperationsJournalPort;
}

export interface PrepareReleaseInput {
  slug: string;
  grantId?: string;
  actor?: string;
  changeId?: string;
  requestKey?: string;
  versionNote?: string;
}

/** 确保存在对应当前正本 targetHash 的已应用 ContentChange（优先复用已有 APPLIED，否则为人工保存补建受控记录） */
async function ensureAppliedChange(
  changesRepo: ContentChangeRepositoryPort,
  input: {
    slug: string;
    changeId?: string;
    targetHash: string;
    publishedHash: string | null;
    grantId?: string;
    actor?: string;
  },
): Promise<ContentChange> {
  if (input.changeId) {
    const found = await changesRepo.findById(input.changeId);
    if (!found) throw new ApiError('content-change-not-found', HttpStatus.NOT_FOUND, '找不到内容候选');
    if (found.state !== 'APPLIED' || found.appliedHash !== input.targetHash) {
      throw new ApiError('content-release-conflict', HttpStatus.CONFLICT, '指定的候选尚未应用或与当前文件版本不一致');
    }
    return found;
  }

  const allChanges = await changesRepo.list({ slug: input.slug });
  const reusable = allChanges.find((c) => c.state === 'APPLIED' && c.appliedHash === input.targetHash);
  if (reusable) return reusable;

  const manualBase = input.publishedHash ?? sha256Hex(`${input.targetHash}:prev`);
  const created = await changesRepo.createOnce({
    id: `chg_man_${randomUUID().slice(0, 12)}`,
    target: { kind: 'content', slug: input.slug },
    baseHash: manualBase,
    candidateHash: input.targetHash,
    candidateRef: `manual_${input.slug}`.slice(0, 100),
    sourceRunId: null,
    requestKey: `man_chg_${input.slug}_${input.targetHash.slice(0, 16)}_${Date.now()}`,
  });
  const applyBinding = {
    action: 'apply-candidate' as const,
    target: { kind: 'content' as const, slug: input.slug },
    baseHash: manualBase,
    candidateHash: input.targetHash,
    grantId: input.grantId || 'grant-manual-owner',
    grantRevision: 1,
  };
  await changesRepo.recordApproval({
    id: created.id,
    approval: {
      id: randomUUID(),
      binding: applyBinding,
      bindingHash: contentApprovalHash(applyBinding),
      approvedBy: input.actor || 'owner',
      approvedAt: new Date().toISOString(),
    },
  });
  const manualRequestId = `req_${randomUUID().slice(0, 8)}`;
  await changesRepo.beginApply({ id: created.id, actor: input.actor || 'owner', requestId: manualRequestId });
  await changesRepo.finishApply({
    id: created.id,
    actor: input.actor || 'owner',
    requestId: manualRequestId,
    outcome: 'APPLIED',
    observedHash: input.targetHash,
  });
  return created;
}

/**
 * 独立发布批准与发布准备（PRD A8/A9、TECH-DESIGN §6.2/C20）：
 * 校验 preflight 门禁、构造不可变 ContentApproval<'publish-website'>，创建 PREPARED 状态记录。
 */
export async function prepareContentRelease(
  deps: ReleasePreparationDeps,
  input: PrepareReleaseInput,
): Promise<ContentRelease> {
  if (!deps.releasesRepo) throw validationError('content-release-repository-unavailable');
  const slug = input.slug.trim();
  if (!slug) throw validationError('slug-required');

  const entry = await deps.entries.get(slug);
  if (!entry) {
    throw new ApiError('content-not-found', HttpStatus.NOT_FOUND, '内容不存在');
  }

  const preflight = await runReleasePreflight(deps, slug);
  if (!preflight.ok) {
    if (preflight.scopeConflict) {
      throw new ApiError('scope-conflict', HttpStatus.CONFLICT, `发布范围冲突：${preflight.scopeConflict.message}`);
    }
    throw validationError(`release-blocked:${preflight.missing.join(',')}`);
  }

  const doc = deps.files ? await deps.files.get(slug) : null;
  const targetHash = doc?.hash ?? preflight.targetHash;
  if (!targetHash) throw validationError('target-hash-missing');

  let publishGrantRevision = 1;
  if (input.grantId) {
    const grant = requireAllowedPublishGrant(await deps.grants?.find(input.grantId), {
      slug,
      actor: input.actor || 'owner',
      message: '发布授权不存在、已失效或不包含当前文章',
    });
    publishGrantRevision = grant.revision;
  }

  const requestKey = input.requestKey?.trim() || `rel_req_${slug}_${targetHash.slice(0, 16)}_${Date.now()}`;
  const existing = await deps.releasesRepo.findByRequestKey(requestKey);
  if (existing) return existing;

  const versionSnapshot = await readContentVersionSnapshot(deps, slug);
  const sourceHash = preflight.publicHash;
  if (!sourceHash) throw validationError('public-hash-missing');

  if (!deps.changesRepo) throw validationError('content-change-repository-unavailable');
  const change = await ensureAppliedChange(deps.changesRepo, {
    slug,
    changeId: input.changeId,
    targetHash,
    publishedHash: versionSnapshot.publishedHash,
    grantId: input.grantId,
    actor: input.actor,
  });

  const publishBinding = {
    action: 'publish-website' as const,
    target: { kind: 'content' as const, slug },
    baseHash: versionSnapshot.publishedHash || change.baseHash,
    candidateHash: sourceHash,
    grantId: input.grantId || 'grant-publish-owner',
    grantRevision: publishGrantRevision,
  };

  const publishApproval: ContentApproval<'publish-website'> = {
    id: randomUUID(),
    binding: publishBinding,
    bindingHash: contentApprovalHash(publishBinding),
    approvedBy: input.actor || 'owner',
    approvedAt: new Date().toISOString(),
  };

  const versionNote = requireVersionNote(input.versionNote?.trim() || '发布新版本');
  return deps.releasesRepo.createOnce({
    id: `rel_${randomUUID().slice(0, 12)}`,
    changeId: change.id,
    target: { kind: 'content', slug },
    baseHash: publishBinding.baseHash,
    sourceHash,
    publishApproval,
    versionNote,
    requestKey,
  });
}

/**
 * 派发前事务复核：校验正本、已批准版本、线上基线与 L2 授权，原子推进 PREPARED → COMMITTING 并落审计。
 */
export async function commitReleaseDispatch(
  deps: {
    files: ContentFileRepositoryPort;
    changesRepo: ContentChangeRepositoryPort;
    journal: OperationsJournalPort;
  },
  input: { slug: string; releaseId: string; preflight: ReleasePreflightResult },
): Promise<{ ext: '.md' | '.mdx'; rawContent: string; versionNote: string }> {
  const { slug, releaseId, preflight } = input;
  const currentDoc = await deps.files.get(slug);
  if (!currentDoc || currentDoc.hash !== preflight.targetHash || !preflight.publicHash) {
    throw new ApiError('content-release-conflict', HttpStatus.CONFLICT, '正本版本已改变');
  }

  let targetContext!: { ext: '.md' | '.mdx'; rawContent: string; versionNote: string };
  await deps.journal.transaction(async (tx) => {
    const release = await tx.releases.findById(releaseId);
    if (
      !release ||
      release.stage !== 'PREPARED' ||
      release.target.slug !== slug ||
      release.sourceHash !== preflight.publicHash ||
      release.publishApproval.binding.candidateHash !== preflight.publicHash
    ) {
      throw new ApiError('content-release-conflict', HttpStatus.CONFLICT, '发布单与当前批准版本不匹配');
    }
    targetContext = {
      ext: currentDoc.ext,
      rawContent: currentDoc.raw,
      versionNote: release.versionNote?.trim() || '发布新版本',
    };
    const change = await deps.changesRepo.findById(release.changeId);
    if (!change || change.target.slug !== slug || change.state !== 'APPLIED' || change.appliedHash !== currentDoc.hash) {
      throw new ApiError('content-release-conflict', HttpStatus.CONFLICT, '已批准文件版本与当前正本不匹配');
    }
    const published = await tx.releases.findLatestPublishedForTarget(slug);
    if (published && release.baseHash !== published.verifiedHash) {
      throw new ApiError('content-release-conflict', HttpStatus.CONFLICT, '线上基线已改变，需重新批准');
    }
    const binding = release.publishApproval.binding;
    if (binding.grantId === 'grant-publish-owner') {
      if (!['owner', 'workstation'].includes(release.publishApproval.approvedBy)) {
        throw new ApiError('content-approval-invalid', HttpStatus.CONFLICT, '站主批准身份无效');
      }
    } else {
      requireAllowedPublishGrant(await tx.grants.find(binding.grantId), {
        slug,
        actor: 'owner',
        expectedRevision: binding.grantRevision,
        message: '发布授权已失效或不包含当前文章',
      });
    }
    await tx.releases.updateStage({ id: releaseId, stage: 'COMMITTING' });
    await tx.appendAudit({
      id: `release-dispatch-${releaseId}`,
      actor: 'owner',
      action: 'content.release.dispatch',
      targetType: 'content-release',
      targetId: releaseId,
      outcome: 'started',
      beforeHash: release.baseHash,
      afterHash: release.sourceHash,
    });
  });

  return targetContext;
}
