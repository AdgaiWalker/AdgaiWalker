import { describe, expect, it } from 'vitest';
import { WorkbenchService } from './workbench.service';
import type { ActionRepositoryPort } from '../ports/action.repository';
import type { PrismaPort } from '../ports/prisma.port';
import type { SeedRepositoryPort } from '../ports/seed.repository';
import type { WorkRepositoryPort } from '../ports/work.repository';

function createWorkbenchHarness() {
  const now = new Date('2026-08-04T00:00:00.000Z');
  const topic = { id: 'seed-1', title: 'topic', severity: null, selfInterest: null, primaryClueId: null, workflowStatus: 'CANDIDATE' as const, whyNow: null, links: [], createdAt: now };
  const open = { id: 'action-1', title: 'task', note: null, kind: 'TASK' as const, entityType: null, entityId: null, status: 'OPEN' as const, plannedDate: null, completedAt: null, source: 'HUMAN' as const, createdAt: now, updatedAt: now };
  const video = { ...open, id: 'video-1', kind: 'VIDEO' as const, status: 'DONE' as const, completedAt: now };
  const work = { id: 'work-1', executionId: 'execution-1', idempotencyKey: 'key', title: 'work', status: 'DRAFT_READY' as const, manifestPath: 'var/works/work-1/manifest.json', coreViewpoint: 'viewpoint', protectedClaims: [], approvedArtifactHash: null, currentStage: null, stageStartedAt: null, lastOutputAt: null, waitingReason: null, createdAt: now, updatedAt: now };
  const seeds = { async list() { return [topic]; } } as unknown as SeedRepositoryPort;
  const actions = { async list(input: { status?: string; kind?: string }) { if (input.kind === 'VIDEO') return [video]; return [open]; } } as unknown as ActionRepositoryPort;
  const works = { async list() { return [work]; } } as unknown as WorkRepositoryPort;
  const prisma: PrismaPort = { getClient: () => null, isWritable: () => true, async ping() { return true; } };
  return new WorkbenchService(prisma, seeds, actions, works);
}

describe('WorkbenchService', () => {
  it('returns topics, open actions, video history, and active works without copying truth', async () => {
    await expect(createWorkbenchHarness().get()).resolves.toMatchObject({
      topics: [{ id: 'seed-1', workflowStatus: 'CANDIDATE' }],
      openActions: [{ id: 'action-1' }],
      videoLog: [{ id: 'video-1', kind: 'VIDEO', status: 'DONE' }],
      activeWorks: [{ id: 'work-1', status: 'DRAFT_READY' }],
    });
  });
});
