import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StageArtifact, WorkStatus } from '@walker/shared';
import type { AgentRunnerPort } from '../ports/agent-runner.port';
import type { ContentFileRepositoryPort } from '../ports/content-file.repository';
import type { ArtifactRepositoryPort } from '../ports/artifact.repository';
import type { PrismaPort } from '../ports/prisma.port';
import type { PublicationPackageRepositoryPort, WechatPublicationPackage } from '../ports/publication-package.repository';
import type { PublicationRecord, PublicationRepositoryPort } from '../ports/publication.repository';
import type { WorkRecord, WorkRepositoryPort } from '../ports/work.repository';
import { FsArtifactRepository } from '../adapters/fs-artifact.repository';
import { FsPublicationPackageRepository } from '../adapters/fs-publication-package.repository';
import { FsStageArtifactRepository } from '../adapters/fs-stage-artifact.repository';
import { ProductionService } from './production.service';
import { PublicationService } from './publication.service';
import { ReviewService } from './review.service';
import { WorkExportService } from './export.service';

const prisma: PrismaPort = { getClient: () => null, isWritable: () => true, async ping() { return true; } };

describe('AI workstation three-work acceptance harness', () => {
  it('runs three drafts through production, one recovery, approval, website and WeChat package export', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-three-work-'));
    const contentRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-three-content-'));
    const exportRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-three-export-'));
    const original: ArtifactRepositoryPort = new FsArtifactRepository(root);
    const stages = new FsStageArtifactRepository(root);
    const packages = new FsPublicationPackageRepository(root);
    const workMap = new Map<string, WorkRecord>();
    const publications = new Map<string, PublicationRecord>();
    const failed = new Set<string>();
    let runnerFailedWork2 = false;
    const works: WorkRepositoryPort = {
      async findById(id) { return workMap.get(id) ?? null; },
      async findByIdempotencyKey(key) { return [...workMap.values()].find((item) => item.idempotencyKey === key) ?? null; },
      async list() { return [...workMap.values()]; },
      async createForExecution() { throw new Error('unused'); },
      async createFromDraft() { throw new Error('unused'); },
      async setStatus(id, status: WorkStatus, hash) {
        const work = workMap.get(id)!;
        work.status = status;
        work.approvedArtifactHash = hash ?? (status === 'APPROVED' ? work.approvedArtifactHash : null);
        work.updatedAt = new Date();
        return work;
      },
    };
    const runner: AgentRunnerPort = {
      async run(input) {
        const stage = input.prompt.match(/stage=([A-Z_]+)/)?.[1] ?? 'NORMALIZE';
        if (stage === 'QUALITY_CHECK' && input.prompt.includes('[work-2]') && !runnerFailedWork2) {
          runnerFailedWork2 = true;
          throw new Error('simulated-quality-check-timeout');
        }
        const marker = input.prompt.includes('[work-2]') ? 'work-2' : 'work';
        return { output: { recipeVersion: 1, stage, output: { body: `[${marker}] ${stage} output`, title: `${marker} ${stage}` } }, rawEvents: [], elapsedMs: 1 };
      },
    };
    const publicationRepo: PublicationRepositoryPort = {
      async find(submissionId, channel) { return [...publications.values()].find((item) => item.submissionId === submissionId && item.channel === channel) ?? null; },
      async upsert(input) {
        const key = `${input.submissionId}:${input.channel}`;
        const now = new Date();
        const value: PublicationRecord = { id: publications.get(key)?.id ?? input.id, submissionId: input.submissionId, channel: input.channel, artifactHash: input.artifactHash, status: input.status, url: input.url ?? null, lastError: input.lastError ?? null, publishedAt: input.publishedAt ?? null, createdAt: publications.get(key)?.createdAt ?? now, updatedAt: now };
        publications.set(key, value);
        return value;
      },
      async list(submissionId) { return [...publications.values()].filter((item) => item.submissionId === submissionId); },
    };
    const files: ContentFileRepositoryPort = {
      async list() { return []; },
      async get() { return null; },
      async save(slug, raw) {
        const full = path.join(contentRoot, `${slug}.md`);
        await fs.writeFile(full, raw);
        return { slug, title: slug, type: 'knowledge', updatedAt: new Date().toISOString(), raw, ext: '.md' as const };
      },
    };
    const packageRepo: PublicationPackageRepositoryPort = {
      async saveWechat(workId: string, value: WechatPublicationPackage) { return packages.saveWechat(workId, value); },
    };
    const production = new ProductionService(prisma, runner, stages, works);
    const review = new ReviewService(prisma, works, stages);
    const publication = new PublicationService(prisma, works, stages, publicationRepo, files, packageRepo);
    const exporter = new WorkExportService(root);

    for (const [index, id] of ['work-1', 'work-2', 'work-3'].entries()) {
      const draft = `# Draft ${index + 1}\n\n[${id}] A real user problem and the author's first-person viewpoint.`;
      await original.createOriginal(id, [{ originalName: 'draft.md', mimeType: 'text/markdown', bytes: Buffer.from(draft), size: Buffer.byteLength(draft), role: 'draft' }]);
      const now = new Date();
      workMap.set(id, { id, executionId: `execution-${id}`, idempotencyKey: `key-${id}`, title: `Draft ${index + 1}`, status: 'DRAFT_READY', manifestPath: `${id}/manifest.json`, coreViewpoint: 'Explain the problem before showing the tool.', protectedClaims: [], approvedArtifactHash: null, createdAt: now, updatedAt: now });
      const first = await production.run(id, draft);
      if (id === 'work-2') {
        expect(first.status).toBe('FAILED');
        if (first.status === 'FAILED') {
          failed.add(first.failedStage);
          expect(first.latestHash).toBeTruthy();
          const recovered = await production.run(id, draft, { fromStage: first.failedStage });
          expect(recovered.status).toBe('REVIEW_READY');
        }
      } else {
        expect(first.status).toBe('REVIEW_READY');
      }
      const reviewReady = await stages.latest(id, 'REVIEW_READY');
      expect(reviewReady).toBeTruthy();
      const approved = await review.approve(id, reviewReady!.hash);
      expect(approved.status).toBe('APPROVED');
      await publication.publishWebsite(id, reviewReady!.hash);
      const prepared = await publication.prepareWechat(id, reviewReady!.hash);
      expect(prepared.packagePath.replaceAll('\\', '/')).toContain('publish/wechat.json');
      const exported = await exporter.export(id, exportRoot);
      await expect(fs.access(path.join(exported.path, 'manifest.json'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(exported.path, 'publish', 'wechat.json'))).resolves.toBeUndefined();
      expect(workMap.get(id)?.status).toBe('COMPLETED');
    }

    expect(failed.has('QUALITY_CHECK')).toBe(true);
    expect(publications.size).toBe(6);
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(contentRoot, { recursive: true, force: true });
    await fs.rm(exportRoot, { recursive: true, force: true });
  });
});
