import 'reflect-metadata';
import fs from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { READ_ONLY_PROFILE, RELEASE_TEST_CASES } from '@walker/shared';
import { AppModule } from '../app.module';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { ReleaseTestService } from '../execution/release-test.service';
import { DeploymentService } from './deployment.service';
import { SITE_CONTENT_INDEX } from '../ports/site-content-index.port';

const token = 'v05-token';
const headers = { 'x-admin-token': token, 'content-type': 'application/json' };
const AGENT = 'v05-agent';
const REV1 = 'v05-rev-1';
const REV2 = 'v05-rev-2';
const HASH1 = '1'.repeat(64);
const HASH2 = '2'.repeat(64);
const SLUG = 'v05-post';

let app: INestApplication;
let base: string;
let db: PrismaClient;
let modelHome: string;
let contentDir: string;
let probeFile: string;

function writeProbeReport(passed: boolean) {
  fs.writeFileSync(probeFile, JSON.stringify({ local: {
    status: passed ? 'pass' : 'fail', processExited: passed, closeError: null,
    answer: passed ? { chars: 2, sha256: 'a'.repeat(64) } : null,
  } }));
}

async function passEvidence(revisionId: string) {
  const configHash = (await app.get(ReleaseTestService).report(AGENT, revisionId)).configHash;
  for (const testCaseId of RELEASE_TEST_CASES) {
    await db.executionRun.create({
      data: {
        id: `v05-test-${revisionId}-${testCaseId}`,
        kind: 'test',
        origin: 'admin',
        actor: 'owner',
        actorScope: 'owner',
        requestKey: `v05-${revisionId}-${testCaseId}`,
        inputHash: 'x'.repeat(64),
        state: 'SUCCEEDED',
        agentRevisionId: revisionId,
        testCaseId,
        suiteVersion: 1,
        configHash,
        assertion: { verdict: 'pass', reason: 'ok' },
      },
    });
  }
}

beforeAll(async () => {
  contentDir = await mkdtemp(path.join(os.tmpdir(), 'walker-v05-content-'));
  modelHome = await mkdtemp(path.join(os.tmpdir(), 'walker-v05-model-'));
  probeFile = path.join(modelHome, 'runtime-probe.json');
  writeProbeReport(true);
  vi.stubEnv('WALKER_MODEL_HOME', modelHome);
  vi.stubEnv('WALKER_ADMIN_TOKEN', token);
  vi.stubEnv('AI_ENABLED', 'false');
  vi.stubEnv('CONTENT_LOG_DIR', contentDir);
  vi.stubEnv('WALKER_RUNTIME_PROBE_REPORT', probeFile);
  vi.stubEnv('WALKER_DELETION_MANIFEST_PATH', path.join(modelHome, 'deletion-manifest.json'));
  vi.stubEnv('WALKER_RESTORE_GATE_FILE', path.join(modelHome, 'restore.pending'));
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SITE_CONTENT_INDEX)
    .useValue({
      loadCitable: async () => [{ slug: SLUG, title: 'V05', summary: 'snapshot', tags: [], actionable: false }],
      loadCitableFull: async () => [{ slug: SLUG, title: 'V05', summary: 'snapshot', tags: [], actionable: false, body: '已核验的公开正文。' }],
      loadCitableSnapshot: async () => ({
        buildId: 'v05-build', collectionHash: 'b'.repeat(64),
        entries: [{ slug: SLUG, title: 'V05', summary: 'snapshot', tags: [], actionable: false, body: '已核验的公开正文。' }],
      }),
    })
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  db = app.get<PrismaPort>(PRISMA).getClient()!;
  await db.agentUnit.create({ data: { id: AGENT, name: 'V05', prompt: '只读' } });
  await db.agentRevision.create({ data: { id: REV1, agentId: AGENT, version: 1, prompt: 'v1', modelId: 'deepseek-chat', toolProfile: READ_ONLY_PROFILE, schemaVersion: 1, configHash: HASH1 } });
  await db.agentRevision.create({ data: { id: REV2, agentId: AGENT, version: 2, prompt: 'v2', modelId: 'deepseek-chat', toolProfile: READ_ONLY_PROFILE, schemaVersion: 1, configHash: HASH2 } });
});

afterAll(async () => {
  await db?.deploymentMember.deleteMany({ where: { deployment: { placementKey: 'post-detail' } } });
  await db?.agentDeployment.deleteMany({ where: { placementKey: 'post-detail' } });
  await db?.executionRun.deleteMany({ where: { actorScope: 'owner', requestKey: { startsWith: 'v05-' } } });
  await db?.auditRecord.deleteMany({ where: { targetType: 'deployment' } });
  await db?.agentRevision.deleteMany({ where: { agentId: AGENT } });
  await db?.agentUnit.deleteMany({ where: { id: AGENT } });
  await app?.close();
  if (contentDir) fs.rmSync(contentDir, { recursive: true, force: true });
  if (modelHome) fs.rmSync(modelHome, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it('创建草稿→测试未过禁启用→证据齐全后启用→解析→禁用立即阻断→回退→CAS 冲突', async () => {
  const created = await (await fetch(`${base}/ops/deployments`, {
    method: 'POST', headers,
    body: JSON.stringify({
      placementKey: 'post-detail', scopeSlug: SLUG,
      members: [
        { agentRevisionId: REV1, isDefault: true },
        { agentRevisionId: REV2, isDefault: false },
      ],
      expectedGeneration: null,
    }),
  })).json();
  expect(created.enabled).toBe(false);
  expect(created.generation).toBe(1);

  // 未登记位置拒绝
  const badPlacement = await fetch(`${base}/ops/deployments`, {
    method: 'POST', headers,
    body: JSON.stringify({ placementKey: 'any-script', scopeSlug: 'x', members: [{ agentRevisionId: REV1, isDefault: true }], expectedGeneration: null }),
  });
  expect(badPlacement.status).toBe(400);

  const readinessDenied = await fetch(`${base}/ops/deployments/${created.id}/readiness`, { headers: { accept: 'application/json' } });
  expect(readinessDenied.status).toBe(401);
  const initialReadiness = await (await fetch(`${base}/ops/deployments/${created.id}/readiness`, { headers })).json();
  expect(initialReadiness.canEnable).toBe(false);
  expect(initialReadiness.gates.find((gate: { key: string }) => gate.key === 'memberPermissions').state).toBe('blocked');

  // 测试证据不足：启用被拒，状态不变
  const early = await fetch(`${base}/ops/deployments/${created.id}/enable`, { method: 'POST', headers, body: JSON.stringify({ expectedGeneration: 1 }) });
  expect(early.status).toBe(403);
  const stillDraft = await (await fetch(`${base}/ops/deployments/${created.id}`, { headers })).json();
  expect(stillDraft.enabled).toBe(false);

  // 只给 REV1 证据不够（REV2 也是成员，全员都须合格）
  await passEvidence(REV1);
  const partial = await fetch(`${base}/ops/deployments/${created.id}/enable`, { method: 'POST', headers, body: JSON.stringify({ expectedGeneration: 1 }) });
  expect(partial.status).toBe(403);

  // 全员合格后启用成功
  await passEvidence(REV2);
  writeProbeReport(false);
  const runtimeBlocked = await (await fetch(`${base}/ops/deployments/${created.id}/readiness`, { headers })).json();
  expect(runtimeBlocked.canEnable).toBe(false);
  expect(runtimeBlocked.gates.find((gate: { key: string }) => gate.key === 'runtimeIsolation').state).toBe('blocked');
  const blockedEnable = await fetch(`${base}/ops/deployments/${created.id}/enable`, {
    method: 'POST', headers, body: JSON.stringify({ expectedGeneration: 1, canEnable: true, force: true }),
  });
  expect(blockedEnable.status).toBe(409);
  expect(await blockedEnable.json()).toMatchObject({ code: 'public-readiness-blocked' });
  writeProbeReport(true);
  const fullReadiness = await (await fetch(`${base}/ops/deployments/${created.id}/readiness`, { headers })).json();
  expect(fullReadiness.canEnable).toBe(true);
  expect(fullReadiness.gates.every((gate: { state: string }) => gate.state === 'ready')).toBe(true);
  expect(JSON.stringify(fullReadiness)).not.toContain(token);
  expect(JSON.stringify(fullReadiness)).not.toContain(modelHome);
  const enabled = await (await fetch(`${base}/ops/deployments/${created.id}/enable`, { method: 'POST', headers, body: JSON.stringify({ expectedGeneration: 1 }) })).json();
  expect(enabled.enabled).toBe(true);
  expect(enabled.generation).toBe(2);

  // 位置解析返回默认成员
  const resolved = await (await fetch(`${base}/ops/deployments/resolve/post-detail/${SLUG}`, { headers })).json();
  expect(resolved.agentRevisionId).toBe(REV1);
  expect(resolved.generation).toBe(2);
  const publicManifestResponse = await fetch(`${base}/assistant/placements/post-detail/${SLUG}`);
  const publicManifest = await publicManifestResponse.json();
  expect(publicManifestResponse.status).toBe(200);
  expect(publicManifest).toMatchObject({
    placementKey: 'post-detail', scopeSlug: SLUG, label: '文章详情', available: true,
    aiEnabled: false, generation: 2,
    members: expect.arrayContaining([
      { key: expect.any(String), name: 'V05', revision: 1, isDefault: true },
      { key: expect.any(String), name: 'V05', revision: 2, isDefault: false },
    ]),
  });
  expect(publicManifest.defaultMemberKey).toBe(publicManifest.members.find((member: { isDefault: boolean }) => member.isDefault)?.key);
  expect(JSON.stringify(publicManifest)).not.toContain(AGENT);
  expect(JSON.stringify(publicManifest)).not.toContain(REV1);
  expect(JSON.stringify(publicManifest)).not.toContain(REV2);
  expect(JSON.stringify(publicManifest)).not.toContain('prompt');
  const selectedMember = publicManifest.members.find((member: { isDefault: boolean }) => member.isDefault)!;
  writeProbeReport(false);
  const blockedManifest = await (await fetch(`${base}/assistant/placements/post-detail/${SLUG}`)).json();
  expect(blockedManifest.available).toBe(false);
  await expect(app.get(DeploymentService).resolvePublicMember('post-detail', SLUG, selectedMember.key, 2))
    .rejects.toMatchObject({ response: { code: 'public-readiness-blocked' }, status: 503 });
  writeProbeReport(true);
  const selectedRevision = await app.get(DeploymentService).resolvePublicMember('post-detail', SLUG, selectedMember.key, 2);
  expect(selectedRevision).toMatchObject({ agentRevisionId: REV1, agentId: AGENT, generation: 2 });
  await expect(app.get(DeploymentService).resolvePublicMember('post-detail', SLUG, selectedMember.key, 1))
    .rejects.toMatchObject({ response: { code: 'placement-generation-conflict' } });
  await expect(app.get(DeploymentService).resolvePublicMember('post-detail', SLUG, 'not-a-public-member', 2))
    .rejects.toMatchObject({ response: { code: 'placement-generation-conflict' } });

  const agentHome = path.join(modelHome, 'agents', AGENT);
  fs.mkdirSync(agentHome, { recursive: true });
  fs.writeFileSync(path.join(agentHome, 'credentials.env'), 'DEEPSEEK_API_KEY=agent-test-key\n');
  const staleKey = await fetch(`${base}/ops/deployments/resolve/post-detail/${SLUG}`, { headers });
  expect(staleKey.status).toBe(404);
  fs.rmSync(path.join(agentHome, 'credentials.env'));
  fs.writeFileSync(path.join(agentHome, 'settings.yaml'), 'agent-default-model:\n  model: other-model\n');
  const staleConfig = await fetch(`${base}/ops/deployments/resolve/post-detail/${SLUG}`, { headers });
  expect(staleConfig.status).toBe(404);
  fs.rmSync(path.join(agentHome, 'settings.yaml'));

  // 禁用立即阻止解析；历史成员保留
  const disabled = await (await fetch(`${base}/ops/deployments/${created.id}/disable`, { method: 'POST', headers, body: JSON.stringify({ expectedGeneration: 2 }) })).json();
  expect(disabled.enabled).toBe(false);
  expect(disabled.members).toHaveLength(2);
  const blocked = await fetch(`${base}/ops/deployments/resolve/post-detail/${SLUG}`, { headers });
  expect(blocked.status).toBe(404);
  const publicBlocked = await (await fetch(`${base}/assistant/placements/post-detail/${SLUG}`)).json();
  expect(publicBlocked).toMatchObject({ available: false, aiEnabled: false, generation: null, members: [], defaultMemberKey: null });

  // 回退到已合格的 REV2：默认成员切换，generation 递增
  const rolledBack = await (await fetch(`${base}/ops/deployments/${created.id}/rollback`, {
    method: 'POST', headers,
    body: JSON.stringify({ agentRevisionId: REV2, expectedGeneration: 3 }),
  })).json();
  expect(rolledBack.generation).toBe(4);
  expect(rolledBack.members.find((m: { isDefault: boolean }) => m.isDefault)?.agentRevisionId).toBe(REV2);

  // 回退目标必须是既有成员
  const notMember = await fetch(`${base}/ops/deployments/${created.id}/rollback`, {
    method: 'POST', headers,
    body: JSON.stringify({ agentRevisionId: 'v05-not-a-member', expectedGeneration: 4 }),
  });
  expect(notMember.status).toBe(422);

  // 旧 generation 的启用/回退都 CAS 冲突
  const stale = await fetch(`${base}/ops/deployments/${created.id}/enable`, { method: 'POST', headers, body: JSON.stringify({ expectedGeneration: 2 }) });
  expect(stale.status).toBe(409);
}, 30000);
