import { describe, expect, it } from 'vitest';
import type { ContentFileRepositoryPort } from '../ports/content-file.repository';
import type { PrismaPort } from '../ports/prisma.port';
import type { PublicationRepositoryPort } from '../ports/publication.repository';
import type { StageArtifactRepositoryPort } from '../ports/stage-artifact.repository';
import type { WorkRepositoryPort, WorkRecord } from '../ports/work.repository';
import { PublicationService } from './publication.service';

function harness() {
  const now = new Date('2026-08-04T00:00:00.000Z');
  const work: WorkRecord = { id: 'work-1', executionId: 'execution-1', idempotencyKey: 'key', title: 'AI draft', status: 'APPROVED', manifestPath: 'manifest', coreViewpoint: 'viewpoint', protectedClaims: [], approvedArtifactHash: 'approved-hash', createdAt: now, updatedAt: now };
  const works: WorkRepositoryPort = { async findById() { return work; }, async findByIdempotencyKey() { return work; }, async list() { return [work]; }, async createForExecution() { return work; }, async createFromDraft() { return work; } };
  const stages: StageArtifactRepositoryPort = { async write() { throw new Error('unused'); }, async latest() { return { workId: work.id, stage: 'REVIEW_READY', hash: 'approved-hash', path: 'review', artifact: { recipeVersion: 1, stage: 'REVIEW_READY', output: { title: 'AI draft', markdown: '# AI draft', html: '<h1>AI draft</h1>', summary: 'summary' } }, createdAt: now.toISOString() }; }, async list() { return []; } };
  const publications: PublicationRepositoryPort = { async find() { return null; }, async upsert(input) { return { ...input, url: input.url ?? null, lastError: null, publishedAt: input.publishedAt ?? null, createdAt: now, updatedAt: now, channel: input.channel, status: input.status }; }, async list() { return []; } };
  let savedRaw = '';
  const files: ContentFileRepositoryPort = { async list() { return []; }, async get() { return null; }, async save(_slug, raw) { savedRaw = raw; return { slug: 'ai-draft', title: 'AI draft', type: 'knowledge', updatedAt: now.toISOString(), raw, ext: '.md' }; } };
  const prisma: PrismaPort = { getClient: () => null, isWritable: () => true, async ping() { return true; } };
  return { service: new PublicationService(prisma, works, stages, publications, files), work, get savedRaw() { return savedRaw; } };
}

describe('PublicationService', () => {
  it('publishes only the approved artifact hash to the website content source', async () => {
    const h = harness();
    await expect(h.service.publishWebsite('work-1', 'wrong-hash')).rejects.toThrow('artifact-hash-mismatch');
    const result = await h.service.publishWebsite('work-1', 'approved-hash');
    expect(result.status).toBe('PUBLISHED');
    expect(result.url).toContain('/posts/ai-draft');
    expect(h.savedRaw).toContain('published: true');
  });
});
