import { describe, expect, it } from 'vitest';
import type { ContentBrief } from '@walker/shared';
import { WorkService } from './work.service';
import type { ArtifactRepositoryPort, OriginalFileInput, WorkManifest } from '../ports/artifact.repository';
import type { PrismaPort } from '../ports/prisma.port';
import type { NewManualWorkRecord, NewWorkRecord, WorkRecord, WorkRepositoryPort } from '../ports/work.repository';

const brief: ContentBrief = {
  audience: 'AI beginners', scenario: 'first draft exists', problem: 'repetition',
  keyQuestion: 'how to finish', intendedAction: 'upload',
};

function oneDraft(): OriginalFileInput {
  return { originalName: 'draft.md', mimeType: 'text/markdown', size: 12, bytes: new TextEncoder().encode('# draft\n'), role: 'draft' };
}

function createWorkHarness(options: { executionExists?: boolean } = {}) {
  const now = new Date('2026-08-04T00:00:00.000Z');
  const executionId = 'execution-1';
  const works: WorkRecord[] = [];
  const manifests: WorkManifest[] = [];
  const manualChains: NewManualWorkRecord[] = [];
  const repository: WorkRepositoryPort = {
    async findById(id) { return works.find((work) => work.id === id) ?? null; },
    async findByIdempotencyKey(key) { return works.find((work) => work.idempotencyKey === key) ?? null; },
    async list() { return works; },
    async createForExecution(input: NewWorkRecord) {
      const work: WorkRecord = { ...input, status: 'DRAFT_READY', approvedArtifactHash: null, createdAt: now, updatedAt: now };
      works.push(work); return work;
    },
    async createFromDraft(input: NewManualWorkRecord) {
      manualChains.push(input);
      const work: WorkRecord = { id: input.id, executionId, idempotencyKey: input.idempotencyKey, title: input.title, status: 'DRAFT_READY', manifestPath: input.manifestPath, coreViewpoint: input.coreViewpoint, protectedClaims: input.protectedClaims, approvedArtifactHash: null, createdAt: now, updatedAt: now };
      works.push(work); return work;
    },
  };
  const artifacts: ArtifactRepositoryPort = {
    async createOriginal(workId, files) {
      const manifest: WorkManifest = { workId, version: 1, originalCreatedAt: now.toISOString(), originalFiles: files.map((file) => ({ name: file.originalName, mimeType: file.mimeType, size: file.size, sha256: 'a'.repeat(64), role: file.role })) };
      manifests.push(manifest); return manifest;
    },
    async readManifest(workId) { return manifests.find((manifest) => manifest.workId === workId) ?? null; },
    async discardWork() {},
  };
  const prisma: PrismaPort = { getClient: () => null, isWritable: () => true, async ping() { return true; } };
  const service = new WorkService(prisma, repository, artifacts);
  return { service, executionId, works, manifests, manualChains };
}

describe('WorkService workstation behavior', () => {
  it('creates a work for an existing execution and stores immutable originals', async () => {
    const harness = createWorkHarness({ executionExists: true });
    const result = await harness.service.create({ idempotencyKey: 'ui-1', executionId: harness.executionId, title: 'draft to work', coreViewpoint: 'AI helps people finish real work', protectedClaimsRaw: '["do not invent"]' }, oneDraft(), []);
    expect(result.status).toBe('DRAFT_READY');
    expect(harness.manifests).toHaveLength(1);
  });

  it('creates the full truth chain for an existing manual draft', async () => {
    const harness = createWorkHarness();
    const result = await harness.service.create({ idempotencyKey: 'ui-2', title: 'draft to work', sourceProblem: 'repetition', whyNow: 'this week', contentBriefRaw: JSON.stringify(brief), coreViewpoint: 'AI helps people finish real work', protectedClaimsRaw: '[]' }, oneDraft(), []);
    expect(result.executionId).toBeTruthy();
    expect(harness.manualChains).toHaveLength(1);
  });

  it('returns the existing work for a repeated idempotency key', async () => {
    const harness = createWorkHarness({ executionExists: true });
    const input = { idempotencyKey: 'same-key', executionId: harness.executionId, title: 'draft to work', coreViewpoint: 'AI helps people finish real work', protectedClaimsRaw: '[]' };
    const first = await harness.service.create(input, oneDraft(), []);
    const second = await harness.service.create(input, oneDraft(), []);
    expect(second.id).toBe(first.id);
    expect(harness.manifests).toHaveLength(1);
  });
});
