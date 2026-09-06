import { describe, expect, it } from 'vitest';
import { PUBLISHED_POST_REQUIRED_FIELDS } from '@walker/shared';
import type { ContentFileRepositoryPort } from '../ports/content-file.repository';
import type { PrismaPort } from '../ports/prisma.port';
import type { PublicationRepositoryPort } from '../ports/publication.repository';
import type { StageArtifactRepositoryPort } from '../ports/stage-artifact.repository';
import type { WorkRepositoryPort, WorkRecord } from '../ports/work.repository';
import { PublicationService } from './publication.service';

function harness() {
  const now = new Date('2026-08-04T00:00:00.000Z');
  const work: WorkRecord = { id: 'work-1', executionId: 'execution-1', idempotencyKey: 'key', title: 'AI draft', status: 'APPROVED', manifestPath: 'manifest', coreViewpoint: 'viewpoint', protectedClaims: [], approvedArtifactHash: 'approved-hash', currentStage: null, stageStartedAt: null, lastOutputAt: null, waitingReason: null, createdAt: now, updatedAt: now };
  const works: WorkRepositoryPort = { async findById() { return work; }, async findByIdempotencyKey() { return work; }, async list() { return [work]; }, async createForExecution() { return work; }, async createFromDraft() { return work; } };
  const stages: StageArtifactRepositoryPort = { async write() { throw new Error('unused'); }, async latest() { return { workId: work.id, stage: 'REVIEW_READY', hash: 'approved-hash', path: 'review', artifact: { recipeVersion: 1, stage: 'REVIEW_READY', output: { title: 'AI draft', markdown: '# AI draft', html: '<h1>AI draft</h1>', summary: 'summary' } }, createdAt: now.toISOString() }; }, async list() { return []; } };
  const publications: PublicationRepositoryPort = { async find() { return null; }, async upsert(input) { return { ...input, url: input.url ?? null, lastError: input.lastError ?? null, publishedAt: input.publishedAt ?? null, createdAt: now, updatedAt: now, channel: input.channel, status: input.status }; }, async list() { return []; } };
  let savedRaw = '';
  const files: ContentFileRepositoryPort = { async list() { return []; }, async get() { return null; }, async save(_slug, raw) { savedRaw = raw; return { slug: 'ai-draft', title: 'AI draft', type: 'knowledge', updatedAt: now.toISOString(), raw, ext: '.md' }; } };
  const prisma: PrismaPort = { getClient: () => null, isWritable: () => true, async ping() { return true; } };
  return { service: new PublicationService(prisma, works, stages, publications, files), prisma, works, stages, publications, files, work, get savedRaw() { return savedRaw; } };
}

describe('PublicationService', () => {
  it('publishes only the approved artifact hash to the website content source', async () => {
    const h = harness();
    await expect(h.service.publishWebsite('work-1', 'wrong-hash')).rejects.toThrow('artifact-hash-mismatch');
    const result = await h.service.publishWebsite('work-1', 'approved-hash');
    expect(result.status).toBe('PREPARED');
    expect(result.url).toContain('/posts/ai-draft');
    expect(h.savedRaw).toContain('published: true');
  });

  it('produces frontmatter that passes the shared build gate (all required fields present)', async () => {
    const h = harness();
    await h.service.publishWebsite('work-1', 'approved-hash');
    const frontmatterBlock = h.savedRaw.split('---')[1] ?? '';
    for (const field of PUBLISHED_POST_REQUIRED_FIELDS) {
      expect(frontmatterBlock).toContain(`${field}:`);
    }
    expect(h.savedRaw).toContain('form: "article"');
    expect(h.savedRaw).toContain('level: "AI-2"');
    expect(h.savedRaw).toMatch(/updated: "\d{4}-\d{2}-\d{2}"/);
  });

  it('saves the file as PREPARED and does not claim publication before remote verification', async () => {
    const h = harness();
    const result = await h.service.publishWebsite('work-1', 'approved-hash');
    expect(result.status).toBe('PREPARED');
    expect(result.publishedAt).toBeNull();
    expect(result.lastError).toBeNull();
  });

  it('verifyWebsite flips to PUBLISHED only when the remote URL is verified', async () => {
    const h = harness();
    const failing = new PublicationService(
      h.prisma, h.works, h.stages, h.publications, h.files, undefined,
      { verify: async () => ({ ok: false, reason: 'remote-content-not-found' }) },
    );
    h.publications.find = async () => ({ id: 'pub-1', submissionId: 'work-1', channel: 'WEBSITE', artifactHash: 'approved-hash', status: 'PREPARED', url: 'https://iwalk.pro/posts/ai-draft', lastError: null, publishedAt: null, createdAt: new Date(), updatedAt: new Date() });
    const failed = await failing.verifyWebsite('work-1');
    expect(failed.status).toBe('FAILED');
    expect(failed.lastError).toBe('remote-content-not-found');

    const passing = new PublicationService(
      h.prisma, h.works, h.stages, h.publications, h.files, undefined,
      { verify: async () => ({ ok: true }) },
    );
    const published = await passing.verifyWebsite('work-1');
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).toBeTruthy();
  });

  it('records a normal-session WeChat draft id while keeping public release manual', async () => {
    const h = harness();
    const service = new PublicationService(
      h.prisma, h.works, h.stages, h.publications, h.files, undefined, undefined,
      { saveDraft: async () => ({ saved: true, draftId: 'draft-123' }) },
    );
    const result = await service.prepareWechat('work-1', 'approved-hash');
    expect(result.publication.status).toBe('WAITING_USER');
    expect(result.publication.url).toBe('wechat://draft/draft-123');
  });

  it('lists independent publication states for one work', async () => {
    const h = harness();
    h.publications.list = async () => [{ id: 'website-1', submissionId: 'work-1', channel: 'WEBSITE', artifactHash: 'approved-hash', status: 'FAILED', url: 'https://iwalk.pro/posts/ai-draft', lastError: 'remote-content-not-found', publishedAt: null, createdAt: new Date(), updatedAt: new Date() }];
    await expect(h.service.list('work-1')).resolves.toMatchObject([{ channel: 'WEBSITE', status: 'FAILED' }]);
  });
});
