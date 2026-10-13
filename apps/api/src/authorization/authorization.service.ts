import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { grantAllows, parseGrantInput, pickUsableGrant, type AuthorizationGrantState, type AuthorizationGrantView, type GrantAvailabilityRequest } from '@walker/shared';
import { ApiError, validationError } from '../common/http-error';
import { OPERATIONS_JOURNAL, type OperationsJournalPort } from '../ports/operations-journal.port';
import { AUTHORIZATION_REPOSITORY, type AuthorizationRepositoryPort } from '../ports/authorization.repository';
import { AGENT_REVISION_REPOSITORY, type AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';

@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(OPERATIONS_JOURNAL) private readonly journal: OperationsJournalPort,
    @Inject(AUTHORIZATION_REPOSITORY) private readonly grants: AuthorizationRepositoryPort,
    @Inject(AGENT_REVISION_REPOSITORY) private readonly agents: AgentRevisionRepositoryPort,
  ) {}
  async issue(raw: unknown, actor: string, now = new Date()) {
    const input = parseGrantInput(raw);
    if (!input) throw validationError('授权字段无效；L2 仅限一次，L3 仅限提醒，发布须单独勾选');
    if (Date.parse(input.expiresAt) <= now.getTime()) throw validationError('授权期限必须晚于当前时间');
    const agent = await this.agents.detail(input.agentId);
    if (!agent || agent.archivedAt || !agent.revisions.length) throw validationError('需要未归档且已有修订的 Agent');
    const id = createHash('sha256').update(`${actor}\0${input.requestKey}`).digest('hex');
    const grant: AuthorizationGrantView = {
      id, principalType: input.level === 'L3' ? 'system' : 'owner', principalId: input.level === 'L3' ? 'reminder-scheduler' : actor,
      agentId: input.agentId, origin: input.level === 'L3' ? 'system' : 'admin', actions: [...input.actions].sort(),
      resourceScope: { ...input.resourceScope, ids: [...input.resourceScope.ids].sort() }, expiresAt: input.expiresAt,
      runLimit: input.runLimit, usageLimit: input.usageLimit, revision: 1, revokedAt: null,
    };
    return this.journal.transaction(async (tx) => {
      const existing = await tx.grants.find(id);
      if (existing) {
        // 只比**签发事实**（见 issuanceOf）：读视图里的用量与撤销状态都不参与比较。
        if (JSON.stringify(issuanceOf(existing)) !== JSON.stringify(issuanceOf(grant))) throw new ApiError('idempotency-conflict', 409, '请求键已用于不同授权');
        return existing;
      }
      const created = await tx.grants.create(grant);
      await tx.appendAudit({ id: `grant-issue-${id}`, actor, action: 'grant.issue', targetType: 'grant', targetId: id, outcome: 'issued', requestId: input.requestKey });
      return created;
    });
  }
  async revoke(id: string, actor: string, now = new Date()) {
    return this.journal.transaction(async (tx) => {
      if (!await tx.grants.find(id)) throw new ApiError('grant-not-found', 404, '找不到授权');
      if (await tx.grants.revoke(id, now)) await tx.appendAudit({ id: `grant-revoke-${id}`, actor, action: 'grant.revoke', targetType: 'grant', targetId: id, outcome: 'revoked' });
      return tx.grants.find(id);
    });
  }
  list(agentId: string) { return this.grants.list(agentId); }

  /**
   * 挑一条**当下真的能跑**的授权——这是全后端唯一一处"选授权"。
   *
   * 选不中返回 `null`：本方法**绝不隐式签发**（签发是要进审计的显式动作，
   * 调用方拿到 null 应当如实告诉用户"没有可用授权"）。
   * 判据来自 shared `grantUsable`，与调度侧的原子 reserve 同源。
   */
  async selectUsable(
    request: Omit<GrantAvailabilityRequest, 'now'> & { now?: number },
  ): Promise<AuthorizationGrantState | null> {
    const { now, ...rest } = request;
    const at = now ?? Date.now();
    return pickUsableGrant(await this.grants.list(request.agentId), { ...rest, now: at });
  }

  async require(id: string, request: Parameters<typeof grantAllows>[1]) {
    const grant = await this.grants.find(id);
    if (!grantAllows(grant, request)) throw new ApiError('authorization-denied', 403, '当前事项未获授权');
    return grant!;
  }
}

/**
 * 一次授权的"签发事实"投影：幂等比对只看这些字段。
 *
 * 排除两类**签发之后会变**的状态，否则同一个请求键会被判成冲突：
 *   revision / revokedAt —— 撤销会改它们（撤销后用同键重发应幂等返回原授权）；
 *   用量四列           —— 每跑一次就变。
 */
function issuanceOf(grant: AuthorizationGrantView | AuthorizationGrantState) {
  return {
    id: grant.id, principalType: grant.principalType, principalId: grant.principalId, agentId: grant.agentId,
    origin: grant.origin, actions: grant.actions, resourceScope: grant.resourceScope,
    expiresAt: grant.expiresAt, runLimit: grant.runLimit, usageLimit: grant.usageLimit,
  };
}
