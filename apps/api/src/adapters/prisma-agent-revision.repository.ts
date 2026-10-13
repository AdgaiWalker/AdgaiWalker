import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AgentRevision } from '@prisma/client';
import { READ_ONLY_PROFILE, type AgentRevisionView } from '@walker/shared';
import { ApiError, storageUnavailable } from '../common/http-error';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import type { AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';
import { revisionHash } from '../agents/agent-config';
function view(row: AgentRevision): AgentRevisionView {
  return { ...row, toolProfile: row.toolProfile as unknown as AgentRevisionView['toolProfile'], createdAt: row.createdAt.toISOString() };
}

@Injectable()
export class PrismaAgentRevisionRepository implements AgentRevisionRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}
  private db() {
    const db = this.prisma.getClient();
    if (!db) throw storageUnavailable();
    return db;
  }
  async list() {
    const rows = await this.db().agentUnit.findMany({ where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, include: { revisions: { orderBy: { version: 'desc' }, take: 1 } } });
    return rows.map((row) => ({ id: row.id, name: row.name, providerId: row.revisions[0]?.providerId ?? row.providerId, modelId: row.modelId, isSystem: row.isSystem, updatedAt: row.updatedAt.toISOString(), revision: row.revisions[0]?.version ?? null }));
  }
  async save(input: Parameters<AgentRevisionRepositoryPort['save']>[0]) {
    return this.db().$transaction(async (tx) => {
      const existing = await tx.agentRevision.findUnique({ where: { id: input.revisionId } });
      if (existing) {
        if (existing.agentId !== input.agentId || existing.configHash !== input.configHash || existing.version !== input.config.baseVersion + 1) {
          throw new ApiError('idempotency-conflict', 409, '这个请求键已用于其他配置');
        }
        return view(existing);
      }
      const agent = await tx.agentUnit.findUnique({ where: { id: input.agentId } });
      if (input.create && agent) throw new ApiError('agent-exists', 409, 'Agent 已存在');
      if (!input.create && !agent) throw new ApiError('agent-not-found', 404, '找不到 Agent');
      if (agent?.archivedAt) throw new ApiError('agent-archived', 409, 'Agent 已归档');
      const latest = await tx.agentRevision.findFirst({ where: { agentId: input.agentId }, orderBy: { version: 'desc' } });
      if ((latest?.version ?? 0) !== input.config.baseVersion) throw new ApiError('revision-conflict', 409, '配置已更新，请刷新后重试');
      const { name, prompt, providerId, modelId } = input.config;
      if (!agent) await tx.agentUnit.create({ data: { id: input.agentId, name, prompt, providerId, modelId } });
      else await tx.agentUnit.update({ where: { id: input.agentId }, data: { name, prompt, providerId, modelId } });
      const revision = await tx.agentRevision.create({ data: {
        id: input.revisionId, agentId: input.agentId, version: input.config.baseVersion + 1,
        prompt, providerId, modelId, toolProfile: { ...READ_ONLY_PROFILE }, schemaVersion: 1, configHash: input.configHash,
      } });
      await tx.auditRecord.create({ data: {
        id: randomUUID(), actor: input.actor, action: 'agent.revise', targetType: 'agent', targetId: input.agentId,
        beforeHash: latest?.configHash, afterHash: input.configHash, outcome: 'saved', requestId: input.config.requestKey,
      } });
      return view(revision);
    });
  }
  async detail(agentId: string) {
    const agent = await this.db().agentUnit.findUnique({ where: { id: agentId }, include: { revisions: { orderBy: { version: 'desc' } } } });
    return agent ? { id: agent.id, name: agent.name, archivedAt: agent.archivedAt?.toISOString() ?? null, revisions: agent.revisions.map(view) } : null;
  }
  async archive(agentId: string, actor: string) {
    await this.db().$transaction(async (tx) => {
      const agent = await tx.agentUnit.findUnique({ where: { id: agentId } });
      if (!agent || agent.archivedAt) return;
      if (agent.isSystem) throw new ApiError('system-agent-protected', 403, '系统角色不能归档');
      await tx.agentUnit.update({ where: { id: agentId }, data: { archivedAt: new Date() } });
      await tx.auditRecord.create({ data: { id: randomUUID(), actor, action: 'agent.archive', targetType: 'agent', targetId: agentId, outcome: 'archived' } });
    });
  }
  async importLegacy(actor: string) {
    const agents = await this.db().agentUnit.findMany({ where: { archivedAt: null, revisions: { none: {} } } });
    let imported = 0;
    for (const agent of agents) {
      const changed = await this.db().$transaction(async (tx) => {
        if (await tx.agentRevision.count({ where: { agentId: agent.id } })) return false;
        const configHash = revisionHash(agent);
        await tx.agentRevision.create({ data: {
          id: `legacy-${agent.id}`, agentId: agent.id, version: 1, prompt: agent.prompt,
          providerId: agent.providerId, modelId: agent.modelId, toolProfile: { ...READ_ONLY_PROFILE }, schemaVersion: 1, configHash,
        } });
        await tx.auditRecord.create({ data: { id: randomUUID(), actor, action: 'agent.import', targetType: 'agent', targetId: agent.id, outcome: 'imported', afterHash: configHash } });
        return true;
      });
      if (changed) imported += 1;
    }
    return imported;
  }
}
