import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, AuthorizationGrant } from '@prisma/client';
import type { AuthorizationGrantState, AuthorizationGrantView } from '@walker/shared';
import { storageUnavailable } from '../common/http-error';
import { PRISMA } from '../ports/prisma.port';
import type { AuthorizationRepositoryPort } from '../ports/authorization.repository';

/** 读视图必须带四个计数器——少了它们，任何调用点都无法判断"还剩几次"。 */
function view(row: AuthorizationGrant): AuthorizationGrantState {
  return { id: row.id, principalType: row.principalType, principalId: row.principalId, agentId: row.agentId,
    origin: row.origin as AuthorizationGrantView['origin'], actions: row.actions as AuthorizationGrantView['actions'],
    resourceScope: row.resourceScope as AuthorizationGrantView['resourceScope'], expiresAt: row.expiresAt?.toISOString() ?? null,
    runLimit: row.runLimit, usageLimit: row.usageLimit, revision: row.revision, revokedAt: row.revokedAt?.toISOString() ?? null,
    runsReserved: row.runsReserved, runsCharged: row.runsCharged,
    usageReserved: row.usageReserved, usageCharged: row.usageCharged };
}
@Injectable()
export class PrismaAuthorizationRepository implements AuthorizationRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: { getClient(): Pick<Prisma.TransactionClient, 'authorizationGrant'> | null }) {}
  private db() { const db = this.prisma.getClient(); if (!db) throw storageUnavailable(); return db; }
  async create(grant: AuthorizationGrantView) {
    // 逐字段显式列出：用量四列由数据库计数器维护，即使调用方结构上带了它们也不许写进来。
    return view(await this.db().authorizationGrant.create({
      data: {
        id: grant.id, principalType: grant.principalType, principalId: grant.principalId, agentId: grant.agentId,
        origin: grant.origin, actions: grant.actions, resourceScope: grant.resourceScope,
        expiresAt: grant.expiresAt === null ? null : new Date(grant.expiresAt),
        runLimit: grant.runLimit, usageLimit: grant.usageLimit, revision: grant.revision,
        revokedAt: grant.revokedAt === null ? null : new Date(grant.revokedAt),
      },
    }));
  }
  async find(id: string) { const row = await this.db().authorizationGrant.findUnique({ where: { id } }); return row ? view(row) : null; }
  async revoke(id: string, now: Date) {
    return (await this.db().authorizationGrant.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now, revision: { increment: 1 } } })).count === 1;
  }
  async list(agentId: string) { return (await this.db().authorizationGrant.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' }, take: 100 })).map(view); }
}
