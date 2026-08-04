import { Inject, Injectable } from '@nestjs/common';
import type { PublicationChannel, PublicationRecord, PublicationRepositoryPort, PublicationStatus } from '../ports/publication.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { storageUnavailable } from '../common/http-error';

@Injectable()
export class PrismaPublicationRepository implements PublicationRepositoryPort {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaPort) {}
  private db() { const client = this.prisma.getClient(); if (!client) throw storageUnavailable(); return client; }
  private map(row: any): PublicationRecord { return { ...row, channel: row.channel as PublicationChannel, status: row.status as PublicationStatus }; }
  async find(submissionId: string, channel: PublicationChannel) { const row = await this.db().publication.findUnique({ where: { submissionId_channel: { submissionId, channel } } }); return row ? this.map(row) : null; }
  async upsert(input: { id: string; submissionId: string; channel: PublicationChannel; artifactHash: string; status: PublicationStatus; url?: string | null; lastError?: string | null; publishedAt?: Date | null }) {
    const row = await this.db().publication.upsert({
      where: { submissionId_channel: { submissionId: input.submissionId, channel: input.channel } },
      create: { id: input.id, submissionId: input.submissionId, channel: input.channel, artifactHash: input.artifactHash, status: input.status, url: input.url ?? null, lastError: input.lastError ?? null, publishedAt: input.publishedAt ?? null },
      update: { artifactHash: input.artifactHash, status: input.status, url: input.url ?? null, lastError: input.lastError ?? null, publishedAt: input.publishedAt ?? null },
    });
    return this.map(row);
  }
  async list(submissionId: string) { return (await this.db().publication.findMany({ where: { submissionId }, orderBy: { createdAt: 'asc' } })).map((row) => this.map(row)); }
}
