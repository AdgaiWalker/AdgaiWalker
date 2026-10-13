import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type ContentChange as ContentChangeRow } from '@prisma/client';
import {
  isContentApprovalBinding,
  isContentChangeState,
  isContentChangeTransitionAllowed,
  isContentOpaqueId,
  isContentSha256,
  isContentTarget,
  type ContentChange,
  type ContentApproval,
} from '@walker/shared';
import { ApiError, storageUnavailable, validationError } from '../common/http-error';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import type { ContentChangeRepositoryPort, NewContentChange } from '../ports/content-change.repository';
import { contentApprovalHash, isPersistableContentApproval, samePersistedContentApproval } from './content-approval.persistence';

function view(row: ContentChangeRow): ContentChange {
  if (row.action !== 'apply-candidate' || !isContentChangeState(row.state) ||
      !isContentSha256(row.baseHash) || !isContentSha256(row.candidateHash) ||
      !isContentTarget({ kind: 'content', slug: row.targetSlug }) ||
      (row.appliedHash !== null && !isContentSha256(row.appliedHash))) {
    throw new ApiError('content-record-invalid', 500, '内容候选记录字段无效');
  }
  const approval = approvalFromRow(row);
  if (['APPROVED', 'APPLYING', 'APPLIED', 'UNKNOWN'].includes(row.state) && !approval) {
    throw new ApiError('content-record-invalid', 500, '候选状态缺少批准快照');
  }
  if (row.state === 'APPLIED' && row.appliedHash !== row.candidateHash) {
    throw new ApiError('content-record-invalid', 500, '已应用候选的正文 hash 不匹配');
  }
  return {
    id: row.id,
    action: 'apply-candidate',
    target: { kind: 'content', slug: row.targetSlug },
    baseHash: row.baseHash,
    candidateHash: row.candidateHash,
    candidateRef: row.candidateRef,
    sourceRunId: row.sourceRunId,
    state: row.state,
    applyApproval: approval,
    appliedHash: row.appliedHash,
    requestKey: row.requestKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function approvalFromRow(row: ContentChangeRow): ContentApproval<'apply-candidate'> | null {
  const parts = [row.applyApprovalId, row.applyApprovalHash, row.applyGrantId,
    row.applyGrantRevision, row.applyApprovedBy, row.applyApprovedAt];
  if (parts.every((part) => part === null)) return null;
  if (parts.some((part) => part === null)) {
    throw new ApiError('content-record-invalid', 500, '内容候选批准快照不完整');
  }
  const binding = {
    action: 'apply-candidate' as const,
    target: { kind: 'content' as const, slug: row.targetSlug },
    baseHash: row.baseHash,
    candidateHash: row.candidateHash,
    grantId: row.applyGrantId!,
    grantRevision: row.applyGrantRevision!,
  };
  if (!isContentApprovalBinding(binding) || !isContentOpaqueId(row.applyApprovalId) ||
      !isContentSha256(row.applyApprovalHash) || row.applyApprovalHash !== contentApprovalHash(binding) ||
      !isContentOpaqueId(row.applyApprovedBy)) {
    throw new ApiError('content-record-invalid', 500, '内容候选批准快照无效');
  }
  const approval = {
    id: row.applyApprovalId,
    binding,
    bindingHash: row.applyApprovalHash,
    approvedBy: row.applyApprovedBy,
    approvedAt: row.applyApprovedAt!.toISOString(),
  };
  if (!isPersistableContentApproval(approval, binding)) {
    throw new ApiError('content-record-invalid', 500, '内容候选批准快照无效');
  }
  return approval;
}

function sameProposal(existing: ContentChange, input: NewContentChange): boolean {
  return existing.target.slug === input.target.slug &&
    existing.baseHash === input.baseHash &&
    existing.candidateHash === input.candidateHash &&
    existing.candidateRef === input.candidateRef &&
    existing.sourceRunId === input.sourceRunId;
}

function validateProposal(input: NewContentChange): void {
  if (!isContentOpaqueId(input.id) || !isContentTarget(input.target) ||
      !isContentSha256(input.baseHash) || !isContentSha256(input.candidateHash) ||
      input.baseHash === input.candidateHash || !isContentOpaqueId(input.candidateRef) ||
      (input.sourceRunId !== null && !isContentOpaqueId(input.sourceRunId)) ||
      !isContentOpaqueId(input.requestKey)) {
    throw validationError('内容候选的标识、目标或版本 hash 无效');
  }
}

function validateApproval(approval: ContentApproval<'apply-candidate'>, row: ContentChangeRow): void {
  const suppliedBinding = (approval as ContentApproval<'apply-candidate'> | null)?.binding;
  if (!isContentApprovalBinding(suppliedBinding)) {
    throw validationError('审批与当前内容候选版本或授权不匹配');
  }
  const binding = {
    action: 'apply-candidate' as const,
    target: { kind: 'content' as const, slug: row.targetSlug },
    baseHash: row.baseHash,
    candidateHash: row.candidateHash,
    grantId: suppliedBinding.grantId,
    grantRevision: suppliedBinding.grantRevision,
  };
  if (!isPersistableContentApproval(approval, binding)) {
    throw validationError('审批与当前内容候选版本或授权不匹配');
  }
}

function sameApproval(existing: ContentApproval<'apply-candidate'> | null, approval: ContentApproval<'apply-candidate'>): boolean {
  return samePersistedContentApproval(existing, approval);
}

@Injectable()
export class PrismaContentChangeRepository implements ContentChangeRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    return db;
  }

  async createOnce(input: NewContentChange): Promise<ContentChange> {
    validateProposal(input);
    try {
      const row = await this.db().contentChange.create({
        data: {
          id: input.id,
          targetSlug: input.target.slug,
          baseHash: input.baseHash,
          candidateHash: input.candidateHash,
          candidateRef: input.candidateRef,
          sourceRunId: input.sourceRunId,
          requestKey: input.requestKey,
        },
      });
      return view(row);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.findByRequestKey(input.requestKey);
      if (!existing || !sameProposal(existing, input)) {
        throw new ApiError('idempotency-conflict', 409, '这个请求键已用于其他内容候选');
      }
      return existing;
    }
  }

  async findById(id: string): Promise<ContentChange | null> {
    const row = await this.db().contentChange.findUnique({ where: { id } });
    return row ? view(row) : null;
  }

  async findByRequestKey(requestKey: string): Promise<ContentChange | null> {
    const row = await this.db().contentChange.findUnique({ where: { requestKey } });
    return row ? view(row) : null;
  }

  async recordApproval(input: { id: string; approval: ContentApproval<'apply-candidate'> }): Promise<ContentChange> {
    const row = await this.db().contentChange.findUnique({ where: { id: input.id } });
    if (!row) throw new ApiError('content-change-not-found', 404, '找不到内容候选');
    validateApproval(input.approval, row);
    const current = view(row);
    if (current.state === 'APPROVED' && sameApproval(current.applyApproval, input.approval)) return current;
    if (current.state !== 'PROPOSED') {
      throw new ApiError('content-approval-conflict', 409, '内容候选已离开可批准状态');
    }

    const changed = await this.db().contentChange.updateMany({
      where: { id: input.id, state: 'PROPOSED' },
      data: {
        state: 'APPROVED',
        applyApprovalId: input.approval.id,
        applyApprovalHash: input.approval.bindingHash,
        applyGrantId: input.approval.binding.grantId,
        applyGrantRevision: input.approval.binding.grantRevision,
        applyApprovedBy: input.approval.approvedBy,
        applyApprovedAt: new Date(input.approval.approvedAt),
      },
    });
    const fresh = await this.db().contentChange.findUnique({ where: { id: input.id } });
    if (!fresh) throw new ApiError('content-change-not-found', 404, '找不到内容候选');
    const result = view(fresh);
    if (changed.count === 1 || sameApproval(result.applyApproval, input.approval)) return result;
    throw new ApiError('content-approval-conflict', 409, '内容候选已被其他操作批准或变更');
  }

  async beginApply(input: { id: string; actor: string; requestId: string }): Promise<ContentChange> {
    return this.db().$transaction(async (tx) => {
      const row = await tx.contentChange.findUnique({ where: { id: input.id } });
      if (!row) throw new ApiError('content-change-not-found', 404, '找不到内容候选');
      const current = view(row);
      if (current.state === 'APPLYING' || current.state === 'APPLIED') return current;
      if (current.state !== 'APPROVED' || !current.applyApproval) {
        throw new ApiError('content-apply-conflict', 409, '内容候选尚未批准或已离开可应用状态');
      }

      const changed = await tx.contentChange.updateMany({
        where: { id: input.id, state: 'APPROVED' },
        data: { state: 'APPLYING' },
      });
      if (changed.count !== 1) {
        const latest = await tx.contentChange.findUnique({ where: { id: input.id } });
        if (latest && ['APPLYING', 'APPLIED'].includes(latest.state)) return view(latest);
        throw new ApiError('content-apply-conflict', 409, '内容候选状态已被其他操作变更');
      }

      await tx.auditRecord.create({
        data: {
          id: randomUUID(),
          actor: input.actor,
          action: 'content.apply.intent',
          targetType: 'content-change',
          targetId: input.id,
          beforeHash: current.baseHash,
          afterHash: current.candidateHash,
          outcome: 'applying',
          requestId: input.requestId,
        },
      });
      const started = await tx.contentChange.findUnique({ where: { id: input.id } });
      if (!started) throw new ApiError('content-change-not-found', 404, '找不到内容候选');
      return view(started);
    });
  }

  async finishApply(input: {
    id: string;
    actor: string;
    requestId: string;
    outcome: 'APPLIED' | 'CONFLICT' | 'UNKNOWN';
    observedHash: string | null;
  }): Promise<ContentChange> {
    if (input.observedHash !== null && !isContentSha256(input.observedHash)) {
      throw validationError('文件核对结果 hash 无效');
    }
    return this.db().$transaction(async (tx) => {
      const row = await tx.contentChange.findUnique({ where: { id: input.id } });
      if (!row) throw new ApiError('content-change-not-found', 404, '找不到内容候选');
      const current = view(row);
      if (current.state === input.outcome) {
        if (input.outcome !== 'APPLIED' || current.appliedHash === current.candidateHash) return current;
      }
      if (current.state !== 'APPLYING' || !isContentChangeTransitionAllowed(current.state, input.outcome)) {
        throw new ApiError('content-apply-conflict', 409, '内容候选应用阶段已被其他操作变更');
      }
      if (input.outcome === 'APPLIED' && input.observedHash !== current.candidateHash) {
        throw validationError('只有文件 hash 与批准候选一致时才能记为 APPLIED');
      }

      const changed = await tx.contentChange.updateMany({
        where: { id: input.id, state: 'APPLYING' },
        data: {
          state: input.outcome,
          appliedHash: input.outcome === 'APPLIED' ? current.candidateHash : null,
        },
      });
      if (changed.count !== 1) {
        const latest = await tx.contentChange.findUnique({ where: { id: input.id } });
        if (latest && latest.state === input.outcome &&
            (input.outcome !== 'APPLIED' || latest.appliedHash === latest.candidateHash)) return view(latest);
        throw new ApiError('content-apply-conflict', 409, '内容候选应用阶段已被其他操作变更');
      }

      await tx.auditRecord.create({
        data: {
          id: randomUUID(),
          actor: input.actor,
          action: `content.apply.${input.outcome.toLowerCase()}`,
          targetType: 'content-change',
          targetId: input.id,
          beforeHash: current.baseHash,
          afterHash: input.observedHash,
          outcome: input.outcome.toLowerCase(),
          requestId: input.requestId,
        },
      });
      const finished = await tx.contentChange.findUnique({ where: { id: input.id } });
      if (!finished) throw new ApiError('content-change-not-found', 404, '找不到内容候选');
      return view(finished);
    });
  }

  async list(filter?: { slug?: string; limit?: number }): Promise<ContentChange[]> {
    const rows = await this.db().contentChange.findMany({
      where: filter?.slug ? { targetSlug: filter.slug } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter?.limit ?? 50, 100),
    });
    return rows.map(view);
  }
}
