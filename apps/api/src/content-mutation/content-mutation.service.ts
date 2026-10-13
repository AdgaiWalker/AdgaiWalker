import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { contentApprovalBindingKey, grantAllows, type ContentApproval, type ContentChange } from '@walker/shared';
import { HttpStatus, Optional } from '@nestjs/common';
import { ApiError, validationError } from '../common/http-error';
import { CONTENT_LOCK, type ContentLockPort } from '../ports/content-lock.port';
import { newId } from '../common/ids';
import { CONTENT_CHANGE_REPOSITORY, type ContentChangeRepositoryPort } from '../ports/content-change.repository';
import { CONTENT_FILE_REPOSITORY, type ContentFileRepositoryPort } from '../ports/content-file.repository';
import { CONTENT_MUTATION_SERVICE, type ContentApproveInput, type ContentMutationInput, type ContentMutationPort, type ContentProposeInput } from '../ports/content-mutation.port';
import { OPERATIONS_JOURNAL, type OperationsJournalPort } from '../ports/operations-journal.port';
import { CANDIDATE_FILE_REPOSITORY, type CandidateFileRepositoryPort } from '../ports/candidate-file.repository';
import { AUTHORIZATION_REPOSITORY, type AuthorizationRepositoryPort } from '../ports/authorization.repository';
import { AGENT_REVISION_REPOSITORY, type AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';
import { AgentExecutionService } from '../execution/agent-execution.service';

function hash(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

@Injectable()
export class ContentMutationService implements ContentMutationPort {
  constructor(
    @Inject(CONTENT_CHANGE_REPOSITORY) private readonly changes: ContentChangeRepositoryPort,
    @Inject(CONTENT_FILE_REPOSITORY) private readonly files: ContentFileRepositoryPort,
    @Inject(OPERATIONS_JOURNAL) private readonly journal: OperationsJournalPort,
    @Inject(CANDIDATE_FILE_REPOSITORY) private readonly candidateFiles: CandidateFileRepositoryPort,
    @Inject(AUTHORIZATION_REPOSITORY) private readonly grants: AuthorizationRepositoryPort,
    @Inject(AGENT_REVISION_REPOSITORY) private readonly agents: AgentRevisionRepositoryPort,
    // 等待与取结果都走 AgentExecutionService 的唯一实现，这里不再需要直接读运行仓储。
    @Inject(AgentExecutionService) private readonly execution: AgentExecutionService,
    @Optional() @Inject(CONTENT_LOCK) private readonly contentLock?: ContentLockPort,
  ) {}

  private async assertNotLocked(): Promise<void> {
    if (!this.contentLock) return;
    if (await this.contentLock.isLocked()) {
      throw new ApiError(
        'content-locked',
        HttpStatus.CONFLICT,
        '工作区正在执行发布，内容已锁定禁止修改',
      );
    }
  }

  async propose(input: ContentProposeInput): Promise<ContentChange> {
    if (!input.slug || !input.agentId || !input.instruction || !input.grantId || !input.requestKey) {
      throw validationError('参数 slug, agentId, instruction, grantId, requestKey 均为必需');
    }

    // 1. 幂等检查
    const existing = await this.changes.findByRequestKey(input.requestKey);
    if (existing) return existing;

    // 2. 固定输入正文版本 baseHash
    const doc = await this.files.get(input.slug);
    if (!doc) throw new ApiError('content-not-found', 404, '内容不存在');
    const baseHash = doc.hash;

    // 3. 校验 L1 授权（R09）
    const grant = await this.grants.find(input.grantId);
    const allowed = grantAllows(grant, {
      origin: 'admin',
      principalType: 'owner',
      principalId: input.actor,
      agentId: input.agentId,
      action: 'content:propose',
      resourceKind: 'content',
      resourceId: input.slug,
      now: Date.now(),
    });
    if (!allowed) {
      throw new ApiError('grant-denied', 403, '授权无效、已过期或不包含 content:propose 权限');
    }

    // 4. 定位 Agent 最新修订
    const detail = await this.agents.detail(input.agentId);
    const revision = detail?.revisions[0];
    if (!detail || detail.archivedAt || !revision) {
      throw new ApiError('agent-not-found', 404, '智能体不存在或未版本化');
    }

    // 5. 调用 Agent 提交运行并等待结束（模型成功/失败均有 run，来源 runId 记录）
    const prompt = JSON.stringify({
      instruction: input.instruction,
      slug: input.slug,
      title: doc.title,
      baseRaw: doc.raw,
    });
    const sanitizedKey = input.requestKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    const idempotencyKey = (sanitizedKey.length >= 8 ? sanitizedKey : `prop_${sanitizedKey}`).slice(0, 120);

    const runView = await this.execution.accept({
      idempotencyKey,
      kind: 'file',
      agentRevisionId: revision.id,
      targetId: input.slug,
      input: prompt,
      grantId: grant!.id,
    });

    // 等运行抵达终态：**不自己拍窗口**。这里是生成整篇候选正文，实测远不止几秒，
    // 而原先只等 60 × 50ms = 3 秒，超时就把还在跑的运行判成失败——和直调那次是同一个病。
    // 等待窗口跟随运行自己的 deadline（后台运行是 120 秒）。
    const run = await this.execution.awaitTerminal(runView.id);
    if (!run || !run.success) {
      throw new ApiError(
        'candidate-generation-failed',
        500,
        `智能体运行未成功（状态：${run?.state ?? '未知'}${run?.stopReason ? `，原因：${run.stopReason}` : ''}）`,
      );
    }

    // 6. 解析输出与坏输出拦截
    const candidateRaw = extractCandidateMarkdown(await this.execution.savedText(run.runId, 100));

    if (!candidateRaw || !candidateRaw.startsWith('---')) {
      throw validationError('候选正文必须包含有效的 YAML frontmatter（以 --- 开头）');
    }

    const candidateHash = hash(candidateRaw);
    if (candidateHash === baseHash || candidateRaw.trim() === doc.raw.trim()) {
      throw new ApiError('candidate-unchanged', 422, '候选正文与基线版本完全一致，未产生有效变更');
    }

    // 7. 保存不可变候选文件并落库 ContentChange（正本 hash 始终不变）
    const candidateId = `cand_${randomUUID().replaceAll('-', '')}`;
    const candidateRecord = await this.candidateFiles.save(candidateId, candidateRaw);

    return await this.changes.createOnce({
      id: candidateId,
      target: { kind: 'content', slug: input.slug },
      baseHash,
      candidateHash: candidateRecord.hash,
      candidateRef: candidateRecord.candidateRef,
      sourceRunId: run.runId,
      requestKey: input.requestKey,
    });
  }

  async approve(input: ContentApproveInput): Promise<ContentChange> {
    if (!input.changeId || !input.grantId || !input.actor) {
      throw validationError('参数 changeId, grantId, actor 均为必需');
    }
    const change = await this.requireChange(input.changeId);
    if (change.state === 'APPROVED') {
      if (change.applyApproval?.binding.grantId === input.grantId) {
        return change;
      }
      throw new ApiError('content-approval-conflict', 409, '内容候选已处于已批准状态');
    }
    if (change.state !== 'PROPOSED') {
      throw new ApiError('content-approval-conflict', 409, '只有 PROPOSED 状态的候选可以批准');
    }

    // 1. 复检正本内容冲突：当前正本 hash 必须严格等于 change.baseHash
    const doc = await this.files.get(change.target.slug);
    if (!doc || doc.hash !== change.baseHash) {
      throw new ApiError('content-base-conflict', 409, '正本内容已有新修改，与候选基线冲突，无法批准');
    }

    // 2. 校验 L2 / 审批授权
    const grant = await this.grants.find(input.grantId);
    if (!grant || grant.revokedAt !== null || !grant.expiresAt || Date.parse(grant.expiresAt) <= Date.now()) {
      throw new ApiError('grant-denied', 403, '授权无效、已撤销或已到期');
    }
    if (!grant.actions.includes('content:approve')) {
      throw new ApiError('grant-denied', 403, '授权不包含 content:approve 权限');
    }
    if (grant.resourceScope.kind !== 'content' || !grant.resourceScope.ids.includes(change.target.slug)) {
      throw new ApiError('grant-denied', 403, '授权范围不包含该文章');
    }

    // 3. 构造不可变审批 binding 与 ContentApproval
    const binding = {
      action: 'apply-candidate' as const,
      target: change.target,
      baseHash: change.baseHash,
      candidateHash: change.candidateHash,
      grantId: grant.id,
      grantRevision: grant.revision,
    };
    const approval: ContentApproval<'apply-candidate'> = {
      id: randomUUID(),
      binding,
      bindingHash: createHash('sha256').update(contentApprovalBindingKey(binding)).digest('hex'),
      approvedBy: input.actor,
      approvedAt: new Date().toISOString(),
    };

    // 4. 持久化审批状态
    const approved = await this.changes.recordApproval({ id: change.id, approval });

    // 5. 记录审计
    await this.journal.transaction((tx) =>
      tx.appendAudit({
        id: randomUUID(),
        actor: input.actor,
        action: 'content.candidate.approved',
        targetType: 'content-change',
        targetId: change.id,
        beforeHash: change.baseHash,
        afterHash: change.candidateHash,
        outcome: 'approved',
        requestId: newId(),
      }),
    ).catch(() => {});

    return approved;
  }

  async apply(input: ContentMutationInput) {
    await this.assertNotLocked();
    const change = await this.requireChange(input.changeId);
    const candidateRaw = await this.resolveCandidateRaw(change, input.candidateRaw);
    if (change.state === 'APPLIED' && change.appliedHash === change.candidateHash) return change;

    if (change.state === 'APPROVED') {
      // 1. 复检审批有效性与授权
      if (!change.applyApproval) {
        throw new ApiError('content-approval-missing', 409, '内容候选尚未获得有效审批');
      }
      const grant = await this.grants.find(change.applyApproval.binding.grantId);
      if (!grant || grant.revokedAt !== null || !grant.expiresAt || Date.parse(grant.expiresAt) <= Date.now()) {
        throw new ApiError('grant-denied', 403, '审批所依据的授权已撤销或到期，无法执行应用');
      }
      if (grant.revision !== change.applyApproval.binding.grantRevision) {
        throw new ApiError('grant-denied', 403, '授权修订版本已发生变更，原审批失效');
      }
      if (!grant.actions.includes('content:apply')) {
        throw new ApiError('grant-denied', 403, '授权不包含 content:apply 权限');
      }

      // 2. 复检当前正本 hash
      const current = await this.files.get(change.target.slug);
      if (!current || current.hash !== change.baseHash) {
        throw new ApiError('content-base-conflict', 409, '正本内容与批准时的基线不一致，已发生冲突');
      }

      // 3. 原子消费审批（单个事务提交 APPROVED -> APPLYING 与 intent audit）
      await this.changes.beginApply({ id: change.id, actor: input.actor, requestId: input.requestId });
    } else if (change.state !== 'APPLYING') {
      throw new ApiError('content-apply-conflict', 409, '内容候选尚未批准或已离开可应用状态');
    }

    return this.reconcile({ ...input, candidateRaw });
  }

  async reconcile(input: ContentMutationInput) {
    const change = await this.requireChange(input.changeId);
    const candidateRaw = await this.resolveCandidateRaw(change, input.candidateRaw);
    if (change.state === 'APPLIED' && change.appliedHash === change.candidateHash) return change;
    if (change.state !== 'APPLYING') {
      throw new ApiError('content-apply-conflict', 409, '只有 APPLYING 候选可以恢复');
    }

    const current = await this.files.get(change.target.slug);
    const currentHash = current?.hash ?? null;
    if (currentHash === change.candidateHash) {
      return this.finishApplied(input, change.candidateHash);
    }
    if (currentHash !== change.baseHash) {
      return this.changes.finishApply({
        id: change.id,
        actor: input.actor,
        requestId: input.requestId,
        outcome: 'CONFLICT',
        observedHash: currentHash,
      });
    }

    let saved;
    try {
      saved = await this.files.save(change.target.slug, candidateRaw, change.baseHash);
    } catch (error) {
      const afterFailure = await this.files.get(change.target.slug);
      const observedHash = afterFailure?.hash ?? null;
      if (observedHash === change.candidateHash) return this.finishApplied(input, observedHash);
      if (observedHash !== change.baseHash) {
        return this.changes.finishApply({
          id: change.id,
          actor: input.actor,
          requestId: input.requestId,
          outcome: 'CONFLICT',
          observedHash,
        });
      }
      throw error;
    }

    if (saved.hash !== change.candidateHash) {
      return this.changes.finishApply({
        id: change.id,
        actor: input.actor,
        requestId: input.requestId,
        outcome: 'CONFLICT',
        observedHash: saved.hash,
      });
    }
    return this.finishApplied(input, saved.hash);
  }

  async saveManual(input: {
    slug: string;
    raw: string;
    expectedHash: string | null;
    actor: string;
    requestId: string;
  }) {
    await this.assertNotLocked();
    const afterHash = hash(input.raw);
    try {
      await this.journal.transaction((tx) => tx.appendAudit({
        id: newId(),
        actor: input.actor,
        action: 'content.manual-save.intent',
        targetType: 'content',
        targetId: input.slug,
        beforeHash: input.expectedHash,
        afterHash,
        outcome: 'saving',
        requestId: input.requestId,
      }));
    } catch {
      throw new ApiError('content-audit-unavailable', 503, '保存审计不可用，正文未写入');
    }

    let saved;
    try {
      saved = await this.files.save(input.slug, input.raw, input.expectedHash);
    } catch (error) {
      const current = await this.files.get(input.slug).catch(() => null);
      const code = apiErrorCode(error);
      try {
        await this.journal.transaction((tx) => tx.appendAudit({
          id: newId(),
          actor: input.actor,
          action: code === 'content-version-conflict' ? 'content.manual-save.conflict' : 'content.manual-save.failed',
          targetType: 'content',
          targetId: input.slug,
          beforeHash: input.expectedHash,
          afterHash: current?.hash ?? null,
          outcome: code === 'content-version-conflict' ? 'conflict' : 'failed',
          requestId: input.requestId,
        }));
      } catch {
        throw new ApiError('content-save-audit-unavailable', 503, '保存失败且结果审计不可用，请重新读取当前版本');
      }
      throw error;
    }

    try {
      await this.journal.transaction((tx) => tx.appendAudit({
        id: newId(),
        actor: input.actor,
        action: 'content.manual-save.completed',
        targetType: 'content',
        targetId: input.slug,
        beforeHash: input.expectedHash,
        afterHash: saved.hash,
        outcome: 'saved',
        requestId: input.requestId,
      }));
    } catch {
      throw new ApiError('content-save-audit-unavailable', 503, '正文已写入，但结果审计暂未确认；请重新读取正文版本');
    }
    return saved;
  }

  private async finishApplied(input: ContentMutationInput, observedHash: string) {
    return this.changes.finishApply({
      id: input.changeId,
      actor: input.actor,
      requestId: input.requestId,
      outcome: 'APPLIED',
      observedHash,
    });
  }

  private async requireChange(id: string) {
    const change = await this.changes.findById(id);
    if (!change) throw new ApiError('content-change-not-found', 404, '找不到内容候选');
    return change;
  }

  private async resolveCandidateRaw(change: { candidateHash: string; candidateRef: string }, inputRaw?: string): Promise<string> {
    if (typeof inputRaw === 'string' && inputRaw.length > 0) {
      this.assertCandidate(change.candidateHash, inputRaw);
      return inputRaw;
    }
    const record = await this.candidateFiles.read(change.candidateRef);
    if (!record) {
      throw new ApiError('candidate-file-not-found', 404, `找不到候选正文文件：${change.candidateRef}`);
    }
    this.assertCandidate(change.candidateHash, record.raw);
    return record.raw;
  }

  private assertCandidate(expectedHash: string, raw: string) {
    if (hash(raw) !== expectedHash) throw validationError('候选正文 hash 与已批准版本不匹配');
  }
}

function extractCandidateMarkdown(text: string): string {
  let cleaned = text.trim();
  const match = cleaned.match(/^```(?:markdown|md)?\r?\n([\s\S]*?)\r?\n```$/);
  if (match) {
    cleaned = match[1].trim();
  }
  return cleaned;
}

function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const response = error.getResponse();
  return typeof response === 'object' && response !== null && 'code' in response && typeof response.code === 'string'
    ? response.code
    : null;
}
