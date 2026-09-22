import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, AuthorizationGrant } from '@prisma/client';
import type { AuthorizationGrantView } from '@walker/shared';
import { storageUnavailable } from '../common/http-error';
import { PRISMA } from '../ports/prisma.port';
import type { AuthorizationRepositoryPort } from '../ports/authorization.repository';
function view(row: AuthorizationGrant): AuthorizationGrantView {
  return { id: row.id, principalType: row.principalType, principalId: row.principalId, agentId: row.agentId,
    origin: row.origin as AuthorizationGrantView['origin'], actions: row.actions as AuthorizationGrantView['actions'],
    resourceScope: row.resourceScope as AuthorizationGrantView['resourceScope'], expiresAt: row.expiresAt?.toISOString() ?? null,
    runLimit: row.runLimit, usageLimit: row.usageLimit, revision: row.revision, revokedAt: row.revokedAt?.toISOString() ?? null };
}
@Injectable()
export class PrismaAuthorizationRepository implements AuthorizationRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: { getClient(): Pick<Prisma.TransactionClient, 'authorizationGrant'> | null }) {}
  private db() { const db = this.prisma.getClient(); if (!db) throw storageUnavailable(); return db; }
  async create(grant: AuthorizationGrantView) {
    const { actions, resourceScope, ...fields } = grant;
    return view(await this.db().authorizationGrant.create({ data: { ...fields, actions: actions, resourceScope: resourceScope } }));
  }
  async find(id: string) { const row = await this.db().authorizationGrant.findUnique({ where: { id } }); return row ? view(row) : null; }
  async revoke(id: string, now: Date) {
    return (await this.db().authorizationGrant.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now, revision: { increment: 1 } } })).count === 1;
  }
  async list(agentId: string) { return (await this.db().authorizationGrant.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' }, take: 100 })).map(view); }
}
