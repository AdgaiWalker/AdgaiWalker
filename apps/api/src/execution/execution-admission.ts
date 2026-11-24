import {
  admissionDeadline,
  denialReason,
  executionPolicyAllows,
  parseExecutionSubmit,
  queueAdmission,
  queueLane,
  READ_ONLY_PROFILE,
  type AgentAction,
  type AuthorizationGrantView,
  type ResourceScope,
  type RunOrigin,
} from '@walker/shared';
import { randomUUID } from 'node:crypto';
import { sha256Hex } from '../common/crypto';
import { ApiError, validationError } from '../common/http-error';
import type { AgentExecutionRecord, AgentExecutionRepositoryPort } from '../ports/agent-execution.repository';
import type { AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';
import type { AuthorizationRepositoryPort } from '../ports/authorization.repository';
import type { ExecutionObjectPolicyPort } from '../ports/execution-object-policy.port';
import type { OperationsJournalPort } from '../ports/operations-journal.port';

export const ADMIN_RUN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const MAX_PUBLIC_EXECUTION_INPUT_CHARS = 90_000;
export const ADMIN_EXECUTION_INPUT_MAX_CHARS = 20_000;

/** 此上下文由鉴权/会话/调度器构造，绝不能从请求体展开。 */
export type ExecutionContext = {
  origin: RunOrigin;
  principalType: 'owner' | 'visitor' | 'system';
  principalId: string;
  agentId: string;
  grantId: string | null;
  parentRunId?: string;
  deploymentId?: string | null;
  placementKey?: string | null;
  deploymentGeneration?: number | null;
  contentSnapshotId?: string | null;
  conversationId?: string | null;
};

export type ExecutionParentPolicy = Parameters<typeof executionPolicyAllows>[0]['parent'];

/** 统一解析 Agent 修订允许的动作集（仅匹配当前只读工具档案时开放只读能力）。 */
export function resolveAgentActions(
  toolProfile: { id?: string; version?: number } | null | undefined,
): AgentAction[] {
  return toolProfile?.id === READ_ONLY_PROFILE.id && toolProfile?.version === READ_ONLY_PROFILE.version
    ? ['agent:run', 'content:read']
    : [];
}

/** 统一返回不同目标类型在执行前必须通过策略校验的动作清单。 */
export function requiredActionsForKind(kind: ResourceScope['kind']): AgentAction[] {
  return kind === 'content' ? ['agent:run', 'content:read'] : ['agent:run'];
}

/**
 * 统一校验父运行继承资格。
 * - 返回 `undefined` 表示未声明父运行；
 * - 返回 `null` 表示父运行不存在、非 RUNNING、归属/授权不一致、已过期或授权缺失；
 * - 否则返回可参与 `executionPolicyAllows` 计算的父策略上下文。
 */
export async function resolveValidParentPolicy(
  runs: Pick<AgentExecutionRepositoryPort, 'findById'>,
  parentRunId: string | null | undefined,
  expectedActor: string,
  expectedGrantId: string | null | undefined,
  grant: AuthorizationGrantView | null,
  now: Date,
): Promise<ExecutionParentPolicy | null> {
  if (!parentRunId) return undefined;
  const parentRun = await runs.findById(parentRunId);
  if (
    !parentRun ||
    parentRun.state !== 'RUNNING' ||
    parentRun.actor !== expectedActor ||
    parentRun.grantId !== expectedGrantId ||
    (parentRun.deadline && parentRun.deadline <= now) ||
    !grant ||
    !parentRun.resourceScope
  ) {
    return null;
  }
  return {
    origin: parentRun.origin,
    principalId: parentRun.actor,
    actions: grant.actions,
    scope: parentRun.resourceScope,
    grantId: parentRun.grantId ?? null,
  };
}

/** 入队前策略校验（不写队列、不启动模型）。 */
export async function preflightExecution(
  deps: {
    agents: Pick<AgentRevisionRepositoryPort, 'detail'>;
    grants: Pick<AuthorizationRepositoryPort, 'find'>;
    runs: Pick<AgentExecutionRepositoryPort, 'findById'>;
    objects: Pick<ExecutionObjectPolicyPort, 'actions'>;
  },
  raw: unknown,
  context: ExecutionContext,
  now = new Date(),
) {
  const input = parseExecutionSubmit(
    raw,
    context.origin === 'public' ? MAX_PUBLIC_EXECUTION_INPUT_CHARS : ADMIN_EXECUTION_INPUT_MAX_CHARS,
  );
  if (!input) throw validationError('运行请求字段无效');
  const denied = () => new ApiError('execution-denied', 403, '当前请求不允许执行');
  if (context.origin === 'public' && context.deploymentId && (input.kind !== 'chat' || !input.targetId)) throw denied();
  if (
    (context.origin === 'admin' && context.principalType !== 'owner') ||
    (context.origin === 'system' && context.principalType !== 'system')
  ) {
    throw denied();
  }
  const agent = await deps.agents.detail(context.agentId);
  const revision = agent?.revisions.find((row) => row.id === input.agentRevisionId);
  if (!agent || agent.archivedAt || !revision) throw denied();
  const agentActions = resolveAgentActions(revision.toolProfile);
  const kind = input.targetId ? 'content' as const : 'agent' as const;
  const target = input.targetId ?? context.agentId;
  if (input.kind === 'file' && !input.targetId) throw denied();
  const grant = context.grantId ? await deps.grants.find(context.grantId) : null;
  const parent = await resolveValidParentPolicy(
    deps.runs,
    context.parentRunId,
    context.principalId,
    context.grantId,
    grant,
    now,
  );
  if (parent === null) throw denied();
  const objectActions = await deps.objects.actions(kind, target, context.agentId);
  for (const action of requiredActionsForKind(kind)) {
    if (!executionPolicyAllows({
      ...context,
      action,
      resourceKind: kind,
      resourceId: target,
      now: now.getTime(),
      agentActions,
      objectActions,
      grant,
      parent,
    })) {
      throw denied();
    }
  }
  return {
    input,
    context,
    revision,
    resourceScope: { kind, ids: [target] },
    grantRevision: grant?.revision ?? null,
    inputHash: sha256Hex(JSON.stringify(input)),
  };
}

/** 调度领取时的唯一策略复核入口，与 `preflightExecution` 共用同一策略判定核心。 */
export async function admitQueuedExecution(
  objects: Pick<ExecutionObjectPolicyPort, 'actions'>,
  runs: Pick<AgentExecutionRepositoryPort, 'locateRevision' | 'findById'>,
  run: AgentExecutionRecord,
  grant: AuthorizationGrantView | null,
  now: Date,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const scope = run.resourceScope;
  const target = scope?.ids[0];
  if (!run.agentRevisionId || !scope || !target) return { ok: false, reason: '当前请求不允许执行' };
  const located = await runs.locateRevision(run.agentRevisionId);
  if (!located || located.archivedAt) return { ok: false, reason: '当前请求不允许执行' };
  const agentActions = resolveAgentActions(located.toolProfile);
  const principalType = run.origin === 'public' ? 'visitor' : run.origin === 'system' ? 'system' : 'owner';
  const parent = await resolveValidParentPolicy(
    runs,
    run.parentRunId,
    run.actor,
    run.grantId,
    grant,
    now,
  );
  if (parent === null) return { ok: false, reason: '当前请求不允许执行' };
  const objectActions = await objects.actions(scope.kind, target, located.agentId);
  for (const action of requiredActionsForKind(scope.kind)) {
    if (!executionPolicyAllows({
      origin: run.origin,
      principalType,
      principalId: run.actor,
      agentId: located.agentId,
      action,
      resourceKind: scope.kind,
      resourceId: target,
      now: now.getTime(),
      agentActions,
      objectActions,
      grant,
      parent,
    })) {
      return {
        ok: false,
        reason: denialReason({
          expectsGrant: run.origin !== 'public',
          grant,
          resourceKind: scope.kind,
          resourceId: target,
          now: now.getTime(),
        }),
      };
    }
  }
  return { ok: true };
}

/** 写入持久队列。队列满或入队时已过期则规则降级，不启动模型。 */
export async function enqueueExecutionRun(
  deps: {
    agents: Pick<AgentRevisionRepositoryPort, 'detail'>;
    grants: Pick<AuthorizationRepositoryPort, 'find'>;
    runs: Pick<AgentExecutionRepositoryPort, 'findById'>;
    objects: Pick<ExecutionObjectPolicyPort, 'actions'>;
    journal: Pick<OperationsJournalPort, 'transaction'>;
  },
  raw: unknown,
  context: ExecutionContext,
  options?: { now?: Date; deadline?: Date | null },
): Promise<{ outcome: 'queued'; runId: string } | { outcome: 'degraded'; reason: string }> {
  const now = options?.now ?? new Date();
  const checked = await preflightExecution(deps, raw, context, now);
  const deadline = admissionDeadline(context.origin, now.getTime(), options?.deadline ? options.deadline.getTime() : null);
  const lane = queueLane(context.origin);
  const actorScope = `${context.origin}:${context.principalId}`;
  return deps.journal.transaction(async (tx) => {
    await tx.runs.lockSchedule();
    const existing = await tx.runs.findByRequest(actorScope, checked.input.requestKey);
    if (existing) return { outcome: 'queued' as const, runId: existing.id };
    const waiting = await tx.runs.countWaiting(lane, now);
    const admission = queueAdmission({ lane, waiting, deadline, now: now.getTime() });
    if (!admission.ok) return { outcome: 'degraded' as const, reason: admission.reason };
    const submitted = await tx.runs.submitIfAbsent({
      id: randomUUID(),
      kind: checked.input.kind,
      origin: context.origin,
      actor: context.principalId,
      actorScope,
      agentRevisionId: checked.input.agentRevisionId,
      requestKey: checked.input.requestKey,
      inputHash: checked.inputHash,
      deploymentId: context.deploymentId ?? null,
      placementKey: context.placementKey ?? null,
      deploymentGeneration: context.deploymentGeneration ?? null,
      contentSnapshotId: context.contentSnapshotId ?? null,
      input: checked.input.input,
      resourceScope: checked.resourceScope,
      deadline: new Date(deadline),
      ...(context.conversationId ? { conversationId: context.conversationId } : {}),
      parentRunId: context.parentRunId ?? null,
      grantId: context.grantId,
    });
    if (context.origin === 'admin') {
      await tx.runs.markRetention(submitted.run.id, {
        retainUntil: new Date(now.getTime() + ADMIN_RUN_RETENTION_MS),
        diagnosticName: `run-${submitted.run.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}.log`,
      });
    }
    return { outcome: 'queued' as const, runId: submitted.run.id };
  });
}
