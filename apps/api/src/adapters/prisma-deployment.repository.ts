import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AgentDeployment, AgentRevision, DeploymentMember } from '@prisma/client';
import type { DeploymentMemberInput, DeploymentView } from '@walker/shared';
import { ApiError, storageUnavailable } from '../common/http-error';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import type { DeploymentRepositoryPort } from '../ports/deployment.repository';

type MemberRow = DeploymentMember & { agentRevision: AgentRevision };

function memberView(row: MemberRow): DeploymentView['members'][number] {
  return {
    id: row.id,
    agentRevisionId: row.agentRevisionId,
    agentId: row.agentRevision.agentId,
    revision: row.agentRevision.version,
    isDefault: row.isDefault,
  };
}

function view(row: AgentDeployment & { members: MemberRow[] }): DeploymentView {
  return {
    id: row.id,
    placementKey: row.placementKey,
    scopeKind: row.scopeKind,
    scopeSlug: row.scopeSlug,
    generation: row.generation,
    enabled: row.enabled,
    members: row.members.map(memberView),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const MEMBER_INCLUDE = { members: { include: { agentRevision: true }, orderBy: { createdAt: 'asc' as const } } };

@Injectable()
export class PrismaDeploymentRepository implements DeploymentRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    return db;
  }

  async list() {
    const rows = await this.db().agentDeployment.findMany({ orderBy: { updatedAt: 'desc' }, include: MEMBER_INCLUDE });
    return rows.map(view);
  }

  async detail(id: string) {
    const row = await this.db().agentDeployment.findUnique({ where: { id }, include: MEMBER_INCLUDE });
    return row ? view(row) : null;
  }

  async findByPlacement(placementKey: string, scopeKind: string, scopeSlug: string) {
    const row = await this.db().agentDeployment.findUnique({
      where: { placementKey_scopeKind_scopeSlug: { placementKey, scopeKind, scopeSlug } },
      include: MEMBER_INCLUDE,
    });
    return row ? view(row) : null;
  }

  async save(input: Parameters<DeploymentRepositoryPort['save']>[0]) {
    if (input.members.length === 0) throw new ApiError('deployment-members-required', 422, '部署至少需要一个成员');
    if (input.members.filter((member) => member.isDefault).length !== 1) {
      throw new ApiError('deployment-default-required', 422, '每个部署必须恰有一个默认成员');
    }
    return this.db().$transaction(async (tx) => {
      const existingById = await tx.agentDeployment.findUnique({ where: { id: input.deploymentId }, include: MEMBER_INCLUDE });
      if (existingById) {
        const same =
          existingById.placementKey === input.placementKey &&
          existingById.scopeKind === input.scopeKind &&
          existingById.scopeSlug === input.scopeSlug &&
          sameMembers(existingById.members, input.members);
        if (!same) throw new ApiError('idempotency-conflict', 409, '这个请求键已用于其他部署内容');
        return view(existingById);
      }
      const revisionIds = input.members.map((member) => member.agentRevisionId);
      const revisions = await tx.agentRevision.findMany({ where: { id: { in: revisionIds } } });
      if (revisions.length !== new Set(revisionIds).size) {
        throw new ApiError('revision-not-found', 404, '成员引用的 Agent 修订不存在');
      }
      const scopeWhere = {
        placementKey: input.placementKey,
        scopeKind: input.scopeKind,
        scopeSlug: input.scopeSlug,
      };
      const existing = await tx.agentDeployment.findUnique({
        where: { placementKey_scopeKind_scopeSlug: scopeWhere },
      });
      if (!existing && input.expectedGeneration !== null) {
        throw new ApiError('revision-conflict', 409, '部署已变化，请刷新后重试');
      }
      if (existing && input.expectedGeneration !== existing.generation) {
        throw new ApiError('revision-conflict', 409, '部署已变化，请刷新后重试');
      }
      if (existing?.enabled && !input.allowEnabledUpdate) {
        throw new ApiError('deployment-enabled', 409, '请先禁用部署，再修改成员');
      }
      const nextGeneration = (existing?.generation ?? 0) + 1;
      if (existing) {
        await tx.deploymentMember.deleteMany({ where: { deploymentId: existing.id } });
      }
      const deployment = existing
        ? await tx.agentDeployment.update({
            where: { id: existing.id },
            data: { generation: nextGeneration },
          })
        : await tx.agentDeployment.create({ data: { id: input.deploymentId, ...scopeWhere, generation: 1 } });
      const deploymentId = existing?.id ?? deployment.id;
      for (const [index, member] of input.members.entries()) {
        await tx.deploymentMember.create({
          data: {
            id: `${deploymentId}-m${index + 1}`,
            deploymentId,
            agentRevisionId: member.agentRevisionId,
            isDefault: member.isDefault,
            generation: nextGeneration,
          },
        });
      }
      await tx.auditRecord.create({
        data: {
          id: randomUUID(),
          actor: input.actor,
          action: existing ? 'deployment.update' : 'deployment.create',
          targetType: 'deployment',
          targetId: deploymentId,
          afterHash: `${input.placementKey}:${input.scopeKind}:${input.scopeSlug}#${nextGeneration}`,
          outcome: 'saved',
          requestId: input.requestId,
        },
      });
      const fresh = await tx.agentDeployment.findUniqueOrThrow({ where: { id: deploymentId }, include: MEMBER_INCLUDE });
      return view(fresh);
    });
  }

  async setEnabled(input: Parameters<DeploymentRepositoryPort['setEnabled']>[0]) {
    return this.db().$transaction(async (tx) => {
      const existing = await tx.agentDeployment.findUnique({ where: { id: input.id } });
      if (!existing) throw new ApiError('deployment-not-found', 404, '找不到部署');
      if (existing.enabled === input.enabled) {
        const unchanged = await tx.agentDeployment.findUniqueOrThrow({ where: { id: input.id }, include: MEMBER_INCLUDE });
        return view(unchanged);
      }
      const changed = await tx.agentDeployment.updateMany({
        where: { id: input.id, generation: input.expectedGeneration },
        data: { enabled: input.enabled, generation: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ApiError('revision-conflict', 409, '部署已变化，请刷新后重试');
      await tx.auditRecord.create({
        data: {
          id: randomUUID(),
          actor: input.actor,
          action: input.enabled ? 'deployment.enable' : 'deployment.disable',
          targetType: 'deployment',
          targetId: input.id,
          outcome: input.enabled ? 'enabled' : 'disabled',
          requestId: input.requestId,
        },
      });
      const fresh = await tx.agentDeployment.findUniqueOrThrow({ where: { id: input.id }, include: MEMBER_INCLUDE });
      return view(fresh);
    });
  }
}

function sameMembers(rows: MemberRow[], input: DeploymentMemberInput[]): boolean {
  if (rows.length !== input.length) return false;
  const wanted = new Map(input.map((member) => [member.agentRevisionId, member.isDefault]));
  return rows.every((row) => wanted.get(row.agentRevisionId) === row.isDefault);
}
