import { describe, expect, it } from 'vitest';
import type { PrismaPort } from '../ports/prisma.port';
import type { StageArtifactRepositoryPort } from '../ports/stage-artifact.repository';
import type { WorkRepositoryPort, WorkRecord } from '../ports/work.repository';
import { ReviewService } from './review.service';

function harness() {
  const now = new Date('2026-08-04T00:00:00.000Z');
  const work: WorkRecord = { id: 'work-1', executionId: 'execution-1', idempotencyKey: 'key', title: 'work', status: 'REVIEW_READY', manifestPath: 'manifest', coreViewpoint: 'viewpoint', protectedClaims: [], approvedArtifactHash: null, createdAt: now, updatedAt: now };
  const works: WorkRepositoryPort = {
    async findById() { return work; }, async findByIdempotencyKey() { return work; }, async list() { return [work]; },
    async createForExecution() { return work; }, async createFromDraft() { return work; },
    async setStatus(_id, status, hash) { work.status = status; work.approvedArtifactHash = hash ?? null; return work; },
  };
  const artifacts: StageArtifactRepositoryPort = {
    async write() { throw new Error('unused'); },
    async latest() { return { workId: 'work-1', stage: 'REVIEW_READY', hash: 'approved-hash', path: 'review.json', artifact: { recipeVersion: 1, stage: 'REVIEW_READY', output: {} }, createdAt: now.toISOString() }; },
    async list() { return []; },
  };
  const prisma: PrismaPort = { getClient: () => null, isWritable: () => true, async ping() { return true; } };
  return { service: new ReviewService(prisma, works, artifacts), work };
}

describe('ReviewService', () => {
  it('approves only the current REVIEW_READY artifact hash', async () => {
    const h = harness();
    await expect(h.service.approve('work-1', 'wrong-hash')).rejects.toThrow('artifact-hash-mismatch');
    await expect(h.service.approve('work-1', 'approved-hash')).resolves.toMatchObject({ status: 'APPROVED', approvedArtifactHash: 'approved-hash' });
  });

  it('supports reversible return and cancellation', async () => {
    const h = harness();
    await expect(h.service.returnForChanges('work-1')).resolves.toMatchObject({ status: 'CHANGES_REQUESTED' });
    await expect(h.service.cancel('work-1')).resolves.toMatchObject({ status: 'CANCELLED' });
  });
});
