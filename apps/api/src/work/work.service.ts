import { Inject, Injectable } from '@nestjs/common';
import {
  normalizeContentBrief,
  parseProtectedClaims,
  validateOriginalUpload,
  type ContentBrief,
} from '@walker/shared';
import { newId } from '../common/ids';
import { storageUnavailable, validationError } from '../common/http-error';
import { ARTIFACT_REPOSITORY, type ArtifactRepositoryPort, type OriginalFileInput } from '../ports/artifact.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { WORK_REPOSITORY, type WorkRepositoryPort } from '../ports/work.repository';

export interface CreateWorkInput {
  idempotencyKey?: string;
  executionId?: string;
  title?: string;
  sourceProblem?: string;
  whyNow?: string;
  contentBriefRaw?: string;
  coreViewpoint?: string;
  protectedClaimsRaw?: string;
}

@Injectable()
export class WorkService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(WORK_REPOSITORY) private readonly works: WorkRepositoryPort,
    @Inject(ARTIFACT_REPOSITORY) private readonly artifacts: ArtifactRepositoryPort,
  ) {}

  async list(limit = 50) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    return this.works.list(limit);
  }

  async get(id: string) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const work = await this.works.findById(id);
    if (!work) throw validationError('work-not-found');
    return work;
  }

  async create(input: CreateWorkInput, draft: OriginalFileInput, attachments: OriginalFileInput[]) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const idempotencyKey = input.idempotencyKey?.trim() ?? '';
    if (!idempotencyKey) throw validationError('idempotency-key-required');
    const existing = await this.works.findByIdempotencyKey(idempotencyKey);
    if (existing) return existing;

    const title = input.title?.trim() ?? '';
    const coreViewpoint = input.coreViewpoint?.trim() ?? '';
    let protectedClaims: string[];
    try { protectedClaims = parseProtectedClaims(input.protectedClaimsRaw ?? ''); }
    catch (error) { throw validationError(error instanceof Error ? error.message : 'invalid-protected-claims'); }
    try {
      validateOriginalUpload({ title, coreViewpoint, draftCount: 1, attachmentCount: attachments.length });
    } catch (error) {
      throw validationError(error instanceof Error ? error.message : 'invalid-original-upload');
    }

    const normalizedBrief = this.parseBrief(input.contentBriefRaw);
    if (!input.executionId && (!input.sourceProblem?.trim() || !input.whyNow?.trim() || !normalizedBrief)) {
      throw validationError('manual-draft-fields-incomplete');
    }

    const workId = newId();
    const files = [draft, ...attachments].map((file, index) => ({ ...file, role: index === 0 ? 'draft' as const : 'attachment' as const }));
    let manifest;
    try {
      manifest = await this.artifacts.createOriginal(workId, files);
      const manifestPath = `var/works/${workId}/manifest.json`;
      if (input.executionId) {
        return await this.works.createForExecution({
          id: workId,
          executionId: input.executionId,
          idempotencyKey,
          title,
          manifestPath,
          coreViewpoint,
          protectedClaims,
        });
      }
      return await this.works.createFromDraft({
        id: workId,
        idempotencyKey,
        title,
        sourceProblem: input.sourceProblem!.trim(),
        whyNow: input.whyNow!.trim(),
        contentBrief: normalizedBrief!,
        coreViewpoint,
        protectedClaims,
        manifestPath,
      });
    } catch (error) {
      await this.artifacts.discardWork(workId);
      throw error;
    }
  }

  private parseBrief(raw?: string): ContentBrief | null {
    if (!raw?.trim()) return null;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw validationError('invalid-content-brief'); }
    try { return normalizeContentBrief(parsed as ContentBrief); }
    catch (error) { throw validationError(error instanceof Error ? error.message : 'content-brief-incomplete'); }
  }
}
