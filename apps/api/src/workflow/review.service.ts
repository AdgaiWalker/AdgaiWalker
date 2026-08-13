import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ProductionStage } from '@walker/shared';
import { storageUnavailable, validationError } from '../common/http-error';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { STAGE_ARTIFACT_REPOSITORY, type StageArtifactRepositoryPort } from '../ports/stage-artifact.repository';
import { WORK_REPOSITORY, type WorkRepositoryPort } from '../ports/work.repository';
import { ARTIFACT_REPOSITORY, type ArtifactRepositoryPort } from '../ports/artifact.repository';

@Injectable()
export class ReviewService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(WORK_REPOSITORY) private readonly works: WorkRepositoryPort,
    @Inject(STAGE_ARTIFACT_REPOSITORY) private readonly artifacts: StageArtifactRepositoryPort,
    @Optional() @Inject(ARTIFACT_REPOSITORY) private readonly originals?: ArtifactRepositoryPort,
  ) {}

  async getReview(workId: string) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const work = await this.requireWork(workId);
    const records = await this.artifacts.list(workId);
    const latest = (stage: ProductionStage) => records.filter((item) => item.stage === stage).at(-1) ?? null;
    const candidate = latest('REVIEW_READY');
    const edits = latest('EDIT');
    const risks = latest('QUALITY_CHECK');
    const frozen = latest('FREEZE_BODY');
    const cover = latest('COVER');
    const website = latest('WEB_FORMAT');
    const wechat = latest('WECHAT_FORMAT');
    return {
      workId,
      status: work.status,
      original: { text: await this.originals?.readOriginalText?.(workId) ?? null, manifestPath: work.manifestPath, coreViewpoint: work.coreViewpoint, protectedClaims: work.protectedClaims },
      candidate: candidate ? { hash: candidate.hash, createdAt: candidate.createdAt, output: candidate.artifact.output } : null,
      edits: edits?.artifact.output ?? null,
      risks: risks?.artifact.output ?? null,
      frozen: frozen?.artifact.output ?? null,
      covers: cover?.artifact.output ?? null,
      platforms: { website: website?.artifact.output ?? null, wechat: wechat?.artifact.output ?? null },
      approvedArtifactHash: work.approvedArtifactHash,
      artifactHistory: records.map((record) => ({ stage: record.stage, hash: record.hash, createdAt: record.createdAt })),
    };
  }

  async approve(workId: string, artifactHash: string) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const work = await this.requireWork(workId);
    if (work.status !== 'REVIEW_READY') throw validationError('work-not-review-ready');
    const latest = await this.artifacts.latest(workId, 'REVIEW_READY');
    if (!latest || latest.hash !== artifactHash) throw validationError('artifact-hash-mismatch');
    if (!this.works.setStatus) throw validationError('work-status-writer-unavailable');
    return this.works.setStatus(workId, 'APPROVED', artifactHash);
  }

  async returnForChanges(workId: string) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    await this.requireWork(workId);
    if (!this.works.setStatus) throw validationError('work-status-writer-unavailable');
    return this.works.setStatus(workId, 'CHANGES_REQUESTED');
  }

  async cancel(workId: string) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    await this.requireWork(workId);
    if (!this.works.setStatus) throw validationError('work-status-writer-unavailable');
    return this.works.setStatus(workId, 'CANCELLED');
  }

  async recover(workId: string, stage: ProductionStage) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    await this.requireWork(workId);
    const latest = await this.artifacts.latest(workId, stage);
    if (!latest) throw validationError('artifact-not-found');
    const artifact = { ...latest.artifact, createdAt: new Date().toISOString() };
    const restored = await this.artifacts.write(workId, artifact);
    if (this.works.setStatus) await this.works.setStatus(workId, 'PROCESSING');
    return restored;
  }

  private async requireWork(id: string) {
    const work = await this.works.findById(id);
    if (!work) throw validationError('work-not-found');
    return work;
  }
}
