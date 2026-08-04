import { describe, expect, it } from 'vitest';
import type { PrismaPort } from '../ports/prisma.port';
import type { StageArtifactRepositoryPort } from '../ports/stage-artifact.repository';
import type { WorkRepositoryPort, WorkRecord } from '../ports/work.repository';
import { ReviewService } from './review.service';

function harness() {
  const now = new Date('2026-08-04T00:00:00.000Z');
  const work: WorkRecord = { id: 'work-1', executionId: 'execution-1', idempotencyKey: 'key', title: 'work', status: 'REVIEW_READY', manifestPath: 'manifest', coreViewpoint: 'viewpoint', protectedClaims: [], approvedArtifactHash: null, currentStage: null, stageStartedAt: null, lastOutputAt: null, waitingReason: null, createdAt: now, updatedAt: now };
  const works: WorkRepositoryPort = {
    async findById() { return work; }, async findByIdempotencyKey() { return work; }, async list() { return [work]; },
    async createForExecution() { return work; }, async createFromDraft() { return work; },
    async setStatus(_id, status, hash) { work.status = status; work.approvedArtifactHash = hash ?? null; return work; },
  };
  const artifacts: StageArtifactRepositoryPort = {
    async write() { throw new Error('unused'); },
    async latest() { return { workId: 'work-1', stage: 'REVIEW_READY', hash: 'approved-hash', path: 'review.json', artifact: { recipeVersion: 1, stage: 'REVIEW_READY', output: {} }, createdAt: now.toISOString() }; },
    async list() { return [
      { workId: 'work-1', stage: 'EDIT', hash: 'edit-hash', path: 'edit.json', artifact: { recipeVersion: 1, stage: 'EDIT', output: { summary: 'restructured' } }, createdAt: now.toISOString() },
      { workId: 'work-1', stage: 'QUALITY_CHECK', hash: 'risk-hash', path: 'risk.json', artifact: { recipeVersion: 1, stage: 'QUALITY_CHECK', output: { risks: [] } }, createdAt: now.toISOString() },
      { workId: 'work-1', stage: 'FREEZE_BODY', hash: 'freeze-hash', path: 'freeze.json', artifact: { recipeVersion: 1, stage: 'FREEZE_BODY', output: { body: 'frozen' } }, createdAt: now.toISOString() },
      { workId: 'work-1', stage: 'COVER', hash: 'cover-hash', path: 'cover.json', artifact: { recipeVersion: 1, stage: 'COVER', output: { landscapeCover: '<svg/>', portraitCover: '<svg/>' } }, createdAt: now.toISOString() },
      { workId: 'work-1', stage: 'WEB_FORMAT', hash: 'web-hash', path: 'web.json', artifact: { recipeVersion: 1, stage: 'WEB_FORMAT', output: { markdown: '# web' } }, createdAt: now.toISOString() },
      { workId: 'work-1', stage: 'WECHAT_FORMAT', hash: 'wechat-hash', path: 'wechat.json', artifact: { recipeVersion: 1, stage: 'WECHAT_FORMAT', output: { html: '<p>wechat</p>' } }, createdAt: now.toISOString() },
      { workId: 'work-1', stage: 'REVIEW_READY', hash: 'approved-hash', path: 'review.json', artifact: { recipeVersion: 1, stage: 'REVIEW_READY', output: { body: 'candidate' } }, createdAt: now.toISOString() },
    ]; },
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

  it('builds one review packet with candidate, edits, risks, covers and platform previews', async () => {
    const h = harness();
    const packet = await h.service.getReview('work-1');
    expect(packet).toMatchObject({ workId: 'work-1', status: 'REVIEW_READY', approvedArtifactHash: null });
    expect(packet.candidate).toBeDefined();
    expect(packet.risks).toBeDefined();
    expect(packet.platforms).toEqual(expect.objectContaining({ website: expect.anything(), wechat: expect.anything() }));
  });
});
