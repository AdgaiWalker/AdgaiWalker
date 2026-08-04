import { describe, expect, it } from 'vitest';
import type { AgentRunnerPort } from '../ports/agent-runner.port';
import type { WorkStatus } from '@walker/shared';
import type { PrismaPort } from '../ports/prisma.port';
import type { StageArtifactRecord, StageArtifactRepositoryPort } from '../ports/stage-artifact.repository';
import type { WorkRepositoryPort } from '../ports/work.repository';
import { ProductionService } from './production.service';

function harness(failStage?: string) {
  const writes: StageArtifactRecord[] = [];
  let calls = 0;
  let failed = false;
  const artifacts: StageArtifactRepositoryPort = {
    async write(workId, artifact) {
      const record = { workId, stage: artifact.stage, hash: `${artifact.stage}-${writes.length}`, path: `stages/${artifact.stage}.json`, artifact, createdAt: new Date().toISOString() };
      writes.push(record); return record;
    },
    async latest(workId, stage) { return writes.filter((item) => item.workId === workId && item.stage === stage).at(-1) ?? null; },
    async list(workId) { return writes.filter((item) => item.workId === workId); },
  };
  const runner: AgentRunnerPort = {
    async run(input) {
      calls += 1;
      if (input.prompt.includes(`stage=${failStage}`) && !failed) { failed = true; throw new Error('runner-timeout'); }
      const stage = input.prompt.match(/stage=([A-Z_]+)/)?.[1] ?? 'NORMALIZE';
      return { output: { recipeVersion: 1, stage, output: { body: `body-${stage}` } }, rawEvents: [], elapsedMs: 1 };
    },
  };
  const prisma: PrismaPort = { getClient: () => null, isWritable: () => true, async ping() { return true; } };
  return { service: new ProductionService(prisma, runner, artifacts), prisma, runner, artifacts, writes, get calls() { return calls; } };
}

describe('ProductionService', () => {
  it('writes each successful stage as a new artifact and reaches review ready', async () => {
    const h = harness();
    const result = await h.service.run('work-1', '# original draft');
    expect(result.status).toBe('REVIEW_READY');
    expect(h.writes).toHaveLength(8);
    expect(h.writes[0].stage).toBe('NORMALIZE');
    expect(h.writes.find((item) => item.stage === 'COVER')?.artifact.output.landscapeCover).toEqual(expect.stringContaining('<svg'));
  });

  it('retries only the failed stage and preserves earlier artifacts', async () => {
    const h = harness('QUALITY_CHECK');
    const failed = await h.service.run('work-2', '# original draft');
    expect(failed.status).toBe('FAILED');
    if (failed.status === 'FAILED') expect(failed.failedStage).toBe('QUALITY_CHECK');
    expect(h.writes.map((item) => item.stage)).toEqual(['NORMALIZE', 'EDIT']);
    const recovered = await h.service.run('work-2', '# original draft', { fromStage: 'QUALITY_CHECK', allowFailure: false });
    expect(recovered.status).toBe('REVIEW_READY');
    expect(h.writes.map((item) => item.stage)).toEqual(['NORMALIZE', 'EDIT', 'QUALITY_CHECK', 'FREEZE_BODY', 'COVER', 'WEB_FORMAT', 'WECHAT_FORMAT', 'REVIEW_READY']);
  });

  it('moves a manually accepted review artifact into the approval queue', async () => {
    const statuses: string[] = [];
    const h = harness();
    const service = new ProductionService(
      h.prisma,
      h.runner,
      h.artifacts,
      { setStatus: async (_id: string, status: WorkStatus) => { statuses.push(status); return {} as never; } } as unknown as WorkRepositoryPort,
    );
    const saved = await service.acceptManualArtifact('work-3', { recipeVersion: 1, stage: 'REVIEW_READY', output: { title: 'manual', body: 'manual body' } });
    expect(statuses).toEqual(['REVIEW_READY']);
    expect(saved.artifact.output.landscapeCover).toEqual(expect.stringContaining('<svg'));
  });

  it('can terminate a queued run without deleting successful artifacts', async () => {
    const h = harness();
    const statuses: string[] = [];
    const service = new ProductionService(
      h.prisma,
      h.runner,
      h.artifacts,
      { setStatus: async (_id: string, status: WorkStatus) => { statuses.push(status); return {} as never; } } as unknown as WorkRepositoryPort,
    );
    await service.cancel('work-cancelled');
    const result = await service.run('work-cancelled', '# original draft');
    expect(result.status).toBe('CANCELLED');
    expect(h.writes).toHaveLength(0);
    expect(statuses).toEqual(['CANCELLED']);
  });
});
