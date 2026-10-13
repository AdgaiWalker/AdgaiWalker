import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOME_XIAOYING_PLACEMENT, PUBLIC_SITE_SCOPE, READ_ONLY_PROFILE, type DeploymentView } from '@walker/shared';
import { PublicReadinessService } from './public-readiness.service';
import type { DeploymentRepositoryPort } from '../ports/deployment.repository';
import type { AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';
import type { SiteContentIndexPort } from '../ports/site-content-index.port';
import type { DeletionTombstoneRecord, LogResourceRepositoryPort } from '../ports/log-resource.repository';
import type { PublicRouteBoundaryPort } from '../ports/public-route-boundary.port';
import { ReleaseTestService } from '../execution/release-test.service';
import { LogResourceService } from '../log-resources/log-resource.service';
import { DeletionManifestReplayService } from '../log-resources/deletion-manifest-replay.service';

const deployment: DeploymentView = {
  id: 'deployment-readiness', placementKey: 'post-detail', scopeKind: 'post', scopeSlug: 'post-a',
  generation: 1, enabled: false, updatedAt: '2026-09-25T00:00:00.000Z',
  members: [{ id: 'member-a', agentRevisionId: 'revision-a', agentId: 'agent-a', revision: 1, isDefault: true }],
};

afterEach(() => vi.unstubAllEnvs());

function createService() {
  const agentRepository = {
    detail: vi.fn(async () => ({
      id: 'agent-a', name: '小影', archivedAt: null,
      revisions: [{ id: 'revision-a', version: 1, toolProfile: READ_ONLY_PROFILE }],
    })),
  } as unknown as AgentRevisionRepositoryPort;
  const content = {
    loadCitableSnapshot: vi.fn(async () => ({ buildId: 'build-a', collectionHash: 'a'.repeat(64), entries: [{ slug: 'post-a' }] })),
  } as unknown as SiteContentIndexPort;
  const logs = { getPolicy: vi.fn(async () => ({ detailRetentionDays: 90, aggregateRetentionDays: 365, updatedAt: new Date() })) } as unknown as LogResourceService;
  const resources = { unfinishedTombstones: vi.fn(async (): Promise<DeletionTombstoneRecord[]> => []) };
  const releaseTests = { report: vi.fn(async () => ({ gate: { ok: true } })) } as unknown as ReleaseTestService;
  const deployments = { detail: vi.fn(async () => deployment) } as unknown as DeploymentRepositoryPort;
  const replay = { assertRecoveryReady: vi.fn(async () => {}) } as unknown as DeletionManifestReplayService;
  const routes = { check: vi.fn((): { matches: boolean; missingFromCaddy: string[]; extraInCaddy: string[] } => ({ matches: true, missingFromCaddy: [], extraInCaddy: [] })) };
  return {
    service: new PublicReadinessService(deployments, agentRepository, releaseTests, content, logs, resources as unknown as LogResourceRepositoryPort, replay, routes as unknown as PublicRouteBoundaryPort),
    resources, routes, releaseTests,
  };
}

describe('PublicReadinessService', () => {
  it('keeps the position blocked and lists the missing runtime proof instead of accepting a pass flag', async () => {
    const probePath = path.join(os.tmpdir(), `walker-readiness-missing-${randomUUID()}.json`);
    vi.stubEnv('WALKER_RUNTIME_PROBE_REPORT', probePath);
    const { service } = createService();

    const report = await service.inspectDeployment(deployment);

    expect(report.canEnable).toBe(false);
    expect(report.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'verifiedSnapshot', state: 'ready' }),
      expect.objectContaining({ key: 'memberPermissions', state: 'ready' }),
      expect.objectContaining({ key: 'runtimeIsolation', state: 'blocked', reason: expect.stringContaining('缺少运行隔离探针报告') }),
      expect.objectContaining({ key: 'logRetention', state: 'ready' }),
      expect.objectContaining({ key: 'deletionRecovery', state: 'ready' }),
      expect.objectContaining({ key: 'publicRoutes', state: 'ready' }),
    ]));
  });

  it('requires a verified public article snapshot for this exact deployment scope', async () => {
    vi.stubEnv('WALKER_RUNTIME_PROBE_REPORT', path.join(os.tmpdir(), `walker-readiness-missing-${randomUUID()}.json`));
    const { service } = createService();
    const invalid = {
      ...deployment,
      scopeSlug: 'not-in-snapshot',
    };

    const report = await service.inspectDeployment(invalid);

    expect(report.canEnable).toBe(false);
    expect(report.gates.find((gate) => gate.key === 'verifiedSnapshot')).toMatchObject({
      state: 'blocked', details: ['not-in-snapshot'],
    });
  });

  it('首页小影用已核验的公开内容集合通过快照门，不要求存在名为 site-public 的文章', async () => {
    vi.stubEnv('WALKER_RUNTIME_PROBE_REPORT', path.join(os.tmpdir(), `walker-readiness-missing-${randomUUID()}.json`));
    const { service } = createService();
    const report = await service.inspectDeployment({
      ...deployment, placementKey: HOME_XIAOYING_PLACEMENT, scopeKind: 'site', scopeSlug: PUBLIC_SITE_SCOPE,
    });
    expect(report.gates.find((gate) => gate.key === 'verifiedSnapshot')?.state).toBe('ready');
  });

  it('blocks enablement when deletion recovery is unfinished or the public route source drifts', async () => {
    vi.stubEnv('WALKER_RUNTIME_PROBE_REPORT', path.join(os.tmpdir(), `walker-readiness-missing-${randomUUID()}.json`));
    const { service, resources, routes } = createService();
    resources.unfinishedTombstones.mockResolvedValue([{ state: 'blocked' }] as never);
    routes.check.mockReturnValue({ matches: false, missingFromCaddy: ['GET health'], extraInCaddy: ['POST ops/secret'] });

    const report = await service.inspectDeployment(deployment);

    expect(report.canEnable).toBe(false);
    expect(report.gates.find((gate) => gate.key === 'deletionRecovery')?.state).toBe('blocked');
    expect(report.gates.find((gate) => gate.key === 'publicRoutes')).toMatchObject({
      state: 'blocked', details: ['GET health', 'POST ops/secret'],
    });
  });
});
