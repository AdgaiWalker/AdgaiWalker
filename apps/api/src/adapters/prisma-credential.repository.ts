import { Inject, Injectable } from '@nestjs/common';
import {
  CREDENTIAL_REPOSITORY,
  type CredentialPublicRow,
  type CredentialRepositoryPort,
  type CredentialRow,
} from '../ports/credential.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { storageUnavailable } from '../common/http-error';

@Injectable()
export class PrismaCredentialRepository implements CredentialRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}

  private db() {
    const c = this.prisma.getClient();
    if (!c) throw storageUnavailable();
    return c;
  }

  list(): Promise<CredentialPublicRow[]> {
    return this.db().credential.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        provider: true,
        last4: true,
        note: true,
        updatedAt: true,
      },
    });
  }

  findByName(name: string): Promise<CredentialRow | null> {
    return this.db().credential.findUnique({ where: { name } });
  }

  findById(id: string): Promise<CredentialRow | null> {
    return this.db().credential.findUnique({ where: { id } });
  }

  save(row: Omit<CredentialRow, 'createdAt' | 'updatedAt'>): Promise<CredentialRow> {
    return this.db().credential.upsert({
      where: { name: row.name },
      create: { ...row },
      update: {
        provider: row.provider,
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.authTag,
        last4: row.last4,
        note: row.note,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.db().credential.delete({ where: { id } });
  }
}
