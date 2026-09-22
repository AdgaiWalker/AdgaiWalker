import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { grantAllows, parseGrantInput, type AuthorizationGrantView } from '@walker/shared';
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
        const original = { ...existing, revision: 1, revokedAt: null };
        if (JSON.stringify(original) !== JSON.stringify(grant)) throw new ApiError('idempotency-conflict', 409, '请求键已用于不同授权');
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
  async require(id: string, request: Parameters<typeof grantAllows>[1]) {
    const grant = await this.grants.find(id);
    if (!grantAllows(grant, request)) throw new ApiError('authorization-denied', 403, '当前事项未获授权');
    return grant!;
  }
}
