import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type ContentRelease as ContentReleaseRow } from '@prisma/client';
import {
  isContentApprovalBinding,
  isContentIndexSyncState,
  isContentOpaqueId,
  isContentReleaseStage,
  isContentReleaseTransitionAllowed,
  isContentSha256,
  isContentTarget,
  type ContentApproval,
  type ContentRelease,
} from '@walker/shared';
import { ApiError, storageUnavailable, validationError } from '../common/http-error';
import { PRISMA } from '../ports/prisma.port';
import type {
  ContentReleaseRepositoryPort,
  NewContentRelease,
  UpdateContentReleaseIndexInput,
  UpdateContentReleaseStageInput,
} from '../ports/content-release.repository';
import { isPersistableContentApproval, samePersistedContentApproval } from './content-approval.persistence';

function approvalFromRow(row: ContentReleaseRow): ContentApproval<'publish-website'> {
  const binding = {
    action: 'publish-website' as const,
    target: { kind: 'content' as const, slug: row.targetSlug },
    baseHash: row.baseHash,
    candidateHash: row.sourceHash,
    grantId: row.publishGrantId,
    grantRevision: row.publishGrantRevision,
  };
  const approval = {
    id: row.publishApprovalId,
    binding,
    bindingHash: row.publishApprovalHash,
    approvedBy: row.publishApprovedBy,
    approvedAt: row.publishApprovedAt.toISOString(),
  };
  if (!isContentApprovalBinding(binding) || !isPersistableContentApproval(approval, binding)) {
    throw new ApiError('content-record-invalid', 500, '网页发布批准快照无效');
  }
  return approval;
}

function view(row: ContentReleaseRow): ContentRelease {
  if (row.action !== 'publish-website' || !isContentReleaseStage(row.stage) ||
      !isContentIndexSyncState(row.assistantIndexState) ||
      !isContentTarget({ kind: 'content', slug: row.targetSlug }) ||
      !isContentSha256(row.baseHash) || !isContentSha256(row.sourceHash) || row.baseHash === row.sourceHash ||
      (row.manifestHash !== null && !isContentSha256(row.manifestHash)) ||
      (row.manifestRef !== null && !isContentOpaqueId(row.manifestRef)) ||
      (row.publishedSnapshotId !== null && !isContentOpaqueId(row.publishedSnapshotId)) ||
      (row.verifiedHash !== null && !isContentSha256(row.verifiedHash))) {
    throw new ApiError('content-record-invalid', 500, '网页发布记录字段无效');
  }
  return {
    id: row.id,
    changeId: row.changeId,
    action: 'publish-website',
    target: { kind: 'content', slug: row.targetSlug },
    baseHash: row.baseHash,
    sourceHash: row.sourceHash,
    publishApproval: approvalFromRow(row),
    stage: row.stage,
    assistantIndexState: row.assistantIndexState,
    manifestHash: row.manifestHash,
    manifestRef: row.manifestRef,
    gitCommit: row.gitCommit,
    publishedSnapshotId: row.publishedSnapshotId,
    verifiedHash: row.verifiedHash,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    errorCode: row.errorCode,
    versionNote: row.versionNote,
    requestKey: row.requestKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function validateInput(input: NewContentRelease): void {
  const approval = input.publishApproval as ContentApproval<'publish-website'> | null;
  const suppliedBinding = approval?.binding;
  if (!isContentOpaqueId(input.id) || !isContentOpaqueId(input.changeId) ||
      !isContentTarget(input.target) || !isContentSha256(input.baseHash) ||
      !isContentSha256(input.sourceHash) || input.baseHash === input.sourceHash ||
      !isContentOpaqueId(input.requestKey) || !isContentApprovalBinding(suppliedBinding)) {
    throw validationError('网页发布目标或版本 hash 无效');
  }
  const expectedBinding = {
    action: 'publish-website' as const,
    target: input.target,
    baseHash: input.baseHash,
    candidateHash: input.sourceHash,
    grantId: suppliedBinding.grantId,
    grantRevision: suppliedBinding.grantRevision,
  };
  if (!isPersistableContentApproval(input.publishApproval, expectedBinding)) {
    throw validationError('网页发布批准与当前候选版本或授权不匹配');
  }
}

function sameRelease(existing: ContentRelease, input: NewContentRelease): boolean {
  return existing.changeId === input.changeId && existing.target.slug === input.target.slug &&
    existing.baseHash === input.baseHash && existing.sourceHash === input.sourceHash &&
    samePersistedContentApproval(existing.publishApproval, input.publishApproval);
}

@Injectable()
export class PrismaContentReleaseRepository implements ContentReleaseRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: {
    getClient(): Pick<Prisma.TransactionClient, 'contentRelease' | 'contentChange'> | null;
  }) {}

  private db() {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    return db;
  }

  async createOnce(input: NewContentRelease): Promise<ContentRelease> {
    validateInput(input);
    const change = await this.db().contentChange.findUnique({ where: { id: input.changeId } });
    if (!change) throw new ApiError('content-change-not-found', 404, '找不到网页发布对应的内容候选');
    // 发布记录用 changeId 追溯「已批准并落盘的候选文件版本」，不重复存文件 hash：
    // change.appliedHash 即该文件版本，sourceHash 是它的公开投影身份。
    if (change.action !== 'apply-candidate' || change.state !== 'APPLIED' ||
        change.targetSlug !== input.target.slug ||
        change.candidateHash !== change.appliedHash) {
      throw new ApiError('content-release-conflict', 409, '网页发布必须绑定已应用的同一内容版本');
    }

    try {
      const row = await this.db().contentRelease.create({
        data: {
          id: input.id,
          changeId: input.changeId,
          targetSlug: input.target.slug,
          baseHash: input.baseHash,
          sourceHash: input.sourceHash,
          publishApprovalId: input.publishApproval.id,
          publishApprovalHash: input.publishApproval.bindingHash,
          publishGrantId: input.publishApproval.binding.grantId,
          publishGrantRevision: input.publishApproval.binding.grantRevision,
          publishApprovedBy: input.publishApproval.approvedBy,
          publishApprovedAt: new Date(input.publishApproval.approvedAt),
          versionNote: input.versionNote ?? null,
          requestKey: input.requestKey,
        },
      });
      return view(row);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.findByRequestKey(input.requestKey);
      if (!existing || !sameRelease(existing, input)) {
        throw new ApiError('idempotency-conflict', 409, '这个请求键已用于其他网页发布内容');
      }
      return existing;
    }
  }

  async findById(id: string): Promise<ContentRelease | null> {
    const row = await this.db().contentRelease.findUnique({ where: { id } });
    return row ? view(row) : null;
  }

  async findByRequestKey(requestKey: string): Promise<ContentRelease | null> {
    const row = await this.db().contentRelease.findUnique({ where: { requestKey } });
    return row ? view(row) : null;
  }

  async listForChange(changeId: string): Promise<ContentRelease[]> {
    const rows = await this.db().contentRelease.findMany({
      where: { changeId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(view);
  }

  async updateStage(input: UpdateContentReleaseStageInput): Promise<ContentRelease> {
    const existing = await this.db().contentRelease.findUnique({ where: { id: input.id } });
    if (!existing) throw new ApiError('content-release-not-found', 404, '找不到发布记录');
    const current = view(existing);

    if (!isContentReleaseTransitionAllowed(current.stage, input.stage, input.verifiedHash ? { expectedHash: current.sourceHash, verifiedHash: input.verifiedHash } : undefined)) {
      throw new ApiError('content-release-transition-invalid', 409, `非法发布状态流转：从 ${current.stage} 到 ${input.stage}`);
    }

    const data: Prisma.ContentReleaseUpdateInput = {
      stage: input.stage,
      updatedAt: new Date(),
    };
    if (input.gitCommit !== undefined) data.gitCommit = input.gitCommit;
    if (input.manifestHash !== undefined) data.manifestHash = input.manifestHash;
    if (input.errorCode !== undefined) data.errorCode = input.errorCode;
    if (input.verifiedHash !== undefined) data.verifiedHash = input.verifiedHash;
    if (input.verifiedAt !== undefined) data.verifiedAt = input.verifiedAt ? new Date(input.verifiedAt) : null;
    if (input.assistantIndexState !== undefined) data.assistantIndexState = input.assistantIndexState;
    if (input.publishedSnapshotId !== undefined) data.publishedSnapshotId = input.publishedSnapshotId;

    const [row] = await this.db().contentRelease.updateManyAndReturn({
      where: { id: input.id, stage: existing.stage },
      data,
    });
    if (!row) throw new ApiError('content-release-transition-conflict', 409, '发布阶段已被其他操作改变');
    return view(row);
  }

  async updateIndexState(input: UpdateContentReleaseIndexInput): Promise<ContentRelease> {
    const existing = await this.db().contentRelease.findUnique({ where: { id: input.id } });
    if (!existing) throw new ApiError('content-release-not-found', 404, '找不到发布记录');

    const data: Prisma.ContentReleaseUpdateInput = {
      assistantIndexState: input.assistantIndexState,
      updatedAt: new Date(),
    };
    if (input.publishedSnapshotId !== undefined) data.publishedSnapshotId = input.publishedSnapshotId;

    const row = await this.db().contentRelease.update({
      where: { id: input.id },
      data,
    });
    return view(row);
  }

  async findLatestForTarget(slug: string): Promise<ContentRelease | null> {
    const row = await this.db().contentRelease.findFirst({
      where: { targetSlug: slug },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return row ? view(row) : null;
  }

  async findLatestPublishedForTarget(slug: string): Promise<ContentRelease | null> {
    const row = await this.db().contentRelease.findFirst({
      where: { targetSlug: slug, stage: 'PUBLISHED' },
      orderBy: [{ verifiedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    return row ? view(row) : null;
  }

  /**
   * 每个 target 的最新一条发布：一次查询取回后在内存里按 slug 取首个（已按时间倒序），
   * 与 findLatestForTarget 的排序口径完全一致。概览页因此不会逐 slug 打 N+1。
   */
  async listLatestPerTarget(): Promise<ContentRelease[]> {
    const rows = await this.db().contentRelease.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const seen = new Set<string>();
    const latest: ContentRelease[] = [];
    for (const row of rows) {
      if (seen.has(row.targetSlug)) continue;
      seen.add(row.targetSlug);
      latest.push(view(row));
    }
    return latest;
  }

  async listLatestPublishedPerTarget(): Promise<ContentRelease[]> {
    const rows = await this.db().contentRelease.findMany({
      where: { stage: 'PUBLISHED' },
      orderBy: [{ verifiedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    const seen = new Set<string>();
    const latest: ContentRelease[] = [];
    for (const row of rows) {
      if (seen.has(row.targetSlug)) continue;
      seen.add(row.targetSlug);
      latest.push(view(row));
    }
    return latest;
  }
}
