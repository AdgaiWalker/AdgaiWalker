import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { access, copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { READ_ONLY_PROFILE, RELEASE_TEST_CASES } from '@walker/shared';
import { AppModule } from '../app.module';
import { APP_CONFIG } from '../config/config.port';
import { hashAnonId } from '../auth/anon-cookie';
import { ReleaseTestService } from '../execution/release-test.service';
import { RUNTIME_PORT, type RuntimePort } from '../ports/runtime.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { SITE_CONTENT_INDEX } from '../ports/site-content-index.port';
import { AgentExecutionService } from '../execution/agent-execution.service';
import type { AgentExecutionRepositoryPort } from '../ports/agent-execution.repository';
import { FsDeletionManifestStore } from '../adapters/fs-deletion-manifest.store';
import { FsAssistantEventSpool } from '../adapters/fs-assistant-event-spool';
import { FsLogResourceCleaner } from '../adapters/fs-log-resource.cleaner';
import { FsTraceRepository } from '../adapters/fs-trace.repository';
import { PrismaConversationDeletionRepository } from '../adapters/prisma-conversation-deletion.repository';
import { PrismaLogResourceRepository } from '../adapters/prisma-log-resource.repository';
import { PrismaOperationsJournal } from '../adapters/prisma-operations-journal';
import { ConversationDeletionService } from '../log-resources/conversation-deletion.service';
import { DeletionManifestReplayService } from '../log-resources/deletion-manifest-replay.service';
import { LogResourceService } from '../log-resources/log-resource.service';

const prefix = `v24-${randomUUID().replaceAll('-', '')}`;
const token = `${prefix}-owner-token`;
const articleSlug = `${prefix}-article`;
const visitorCookie = createHash('sha256').update(prefix).digest('hex');
const agentId = `${prefix}-agent`;
const firstRevisionId = `${prefix}-revision-a`;
const secondRevisionId = `${prefix}-revision-b`;
const releaseRunPrefix = `${prefix}-release-`;
const headers = { 'x-admin-token': token, 'content-type': 'application/json', accept: 'application/json' };
const runtimeCalls: Array<{ revisionId: string; inputSessionId: string | null }> = [];
const runtime: RuntimePort = {
  async start() {},
  async run(request) {
    const revisionId = request.owner.agentRevisionId;
    runtimeCalls.push({ revisionId, inputSessionId: request.sessionId ?? null });
    const answer = revisionId === firstRevisionId ? '第一位成员：先核对公开正文。' : '第二位成员：再按引用完成下一步。';
    const sessionId = `${prefix}-session-${revisionId === firstRevisionId ? 'a' : 'b'}`;
    await request.onSessionResource?.({ sessionId, kind: 'native-session' });
    const text = JSON.stringify({ answer, citations: [articleSlug] });
    request.observe?.({ kind: 'text', text });
    request.observe?.({ kind: 'usage', usage: { inputTokens: 7, outputTokens: 9, cacheReadTokens: 0 } });
    return {
      ok: true,
      sessionId,
      text,
      json: JSON.parse(text),
      usage: { inputTokens: 7, outputTokens: 9, cacheReadTokens: 0 },
      outputKind: 'json',
    };
  },
  observe() { return () => undefined; },
  async close() { return { exited: true }; },
};

let app: INestApplication;
let baseUrl = '';
let db: PrismaClient;
let tempRoot = '';
let modelHome = '';
let runsDir = '';
let exportDir = '';
let contentDir = '';
let probeFile = '';
let manifestFile = '';
let manifestReplica = '';
const exportIds: string[] = [];
let deploymentId: string | null = null;
let conversationId: string | null = null;

async function post(url: string, body: unknown, requestHeaders: Record<string, string> = headers) {
  return fetch(`${baseUrl}${url}`, { method: 'POST', headers: requestHeaders, body: JSON.stringify(body) });
}

async function passEvidence(revisionId: string) {
  const configHash = (await app.get(ReleaseTestService).report(agentId, revisionId)).configHash;
  for (const testCaseId of RELEASE_TEST_CASES) {
    await db.executionRun.create({
      data: {
        id: `${prefix}-evidence-${revisionId.endsWith('-a') ? 'a' : 'b'}-${testCaseId}`,
        kind: 'test', origin: 'admin', actor: 'owner', actorScope: 'admin:owner',
        requestKey: `${releaseRunPrefix}${revisionId.endsWith('-a') ? 'a' : 'b'}-${testCaseId}`,
        inputHash: 'x'.repeat(64), state: 'SUCCEEDED', agentRevisionId: revisionId,
        testCaseId, suiteVersion: 1, configHash,
        assertion: { verdict: 'pass', reason: 'isolated fixture' },
      },
    });
  }
}

async function waitForExport(id: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${baseUrl}/ops/exports/${id}`, { headers });
    expect(response.status).toBe(200);
    const job = await response.json() as { state: string };
    if (job.state === 'READY') return;
    if (['FAILED', 'REVOKED', 'EXPIRED'].includes(job.state)) throw new Error(`导出提前结束：${job.state}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('导出任务没有及时完成');
}

beforeAll(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'walker-v24-journey-'));
  modelHome = path.join(tempRoot, 'model-home');
  runsDir = path.join(tempRoot, 'runs');
  exportDir = path.join(tempRoot, 'exports');
  contentDir = path.join(tempRoot, 'content');
  probeFile = path.join(tempRoot, 'runtime-probe.json');
  manifestFile = path.join(tempRoot, 'control', 'deletion-manifest.json');
  manifestReplica = path.join(tempRoot, 'replica', 'deletion-manifest.json');
  fs.writeFileSync(probeFile, JSON.stringify({ local: {
    status: 'pass', processExited: true, closeError: null,
    answer: { chars: 2, sha256: 'a'.repeat(64) },
  } }));
  vi.stubEnv('WALKER_ADMIN_TOKEN', token);
  vi.stubEnv('AI_ENABLED', 'true');
  vi.stubEnv('WALKER_STARTUP_RECONCILIATION', '1');
  vi.stubEnv('WALKER_MODEL_HOME', modelHome);
  vi.stubEnv('WALKER_RUNS_DIR', runsDir);
  vi.stubEnv('WALKER_EXPORT_DIR', exportDir);
  vi.stubEnv('CONTENT_LOG_DIR', contentDir);
  vi.stubEnv('WALKER_RUNTIME_PROBE_REPORT', probeFile);
  vi.stubEnv('WALKER_DELETION_MANIFEST_PATH', manifestFile);
  vi.stubEnv('WALKER_DELETION_MANIFEST_REPLICA_PATH', manifestReplica);
  vi.stubEnv('WALKER_RESTORE_GATE_FILE', path.join(tempRoot, 'restore.pending'));

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue({
      getDatabaseUrl: () => process.env.DATABASE_URL ?? '',
      isAiEnabled: () => true,
      getHost: () => '127.0.0.1',
      getPort: () => 8788,
      getNodeEnv: () => 'test',
      getWorkRootDir: () => path.join(tempRoot, 'works'),
      getWorkMaxUploadBytes: () => 1024,
    })
    .overrideProvider(RUNTIME_PORT).useValue(runtime)
    .overrideProvider(SITE_CONTENT_INDEX)
    .useValue({
      loadCitable: async () => [{ slug: articleSlug, title: '隔离文章', summary: '测试快照', tags: [], actionable: false }],
      loadCitableFull: async () => [{ slug: articleSlug, title: '隔离文章', summary: '测试快照', tags: [], actionable: false, body: '只读的已核验公开正文。' }],
      loadCitableSnapshot: async () => ({
        buildId: `${prefix}-build`, collectionHash: 'b'.repeat(64),
        entries: [{ slug: articleSlug, title: '隔离文章', summary: '测试快照', tags: [], actionable: false, body: '只读的已核验公开正文。' }],
      }),
    })
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  db = app.get<PrismaPort>(PRISMA).getClient()!;
  await db.agentUnit.create({ data: { id: agentId, name: 'V24 测试角色', prompt: '只读' } });
  await db.agentRevision.createMany({ data: [
    { id: firstRevisionId, agentId, version: 1, prompt: '第一位成员', modelId: 'deepseek-chat', toolProfile: READ_ONLY_PROFILE, schemaVersion: 1, configHash: '1'.repeat(64) },
    { id: secondRevisionId, agentId, version: 2, prompt: '第二位成员', modelId: 'deepseek-chat', toolProfile: READ_ONLY_PROFILE, schemaVersion: 1, configHash: '2'.repeat(64) },
  ] });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
}, 30_000);

afterAll(async () => {
  try {
    if (db) {
      const conversations = await db.conversation.findMany({
        where: { placementKey: 'post-detail', scopeSlug: articleSlug }, select: { id: true },
      });
      const conversationIds = [...new Set([conversationId, ...conversations.map((row) => row.id)].filter((id): id is string => Boolean(id)))];
      const runs = await db.executionRun.findMany({
        where: { OR: [
          { agentRevisionId: { in: [firstRevisionId, secondRevisionId] } },
          { requestKey: { startsWith: releaseRunPrefix } },
        ] },
        select: { id: true },
      });
      const runIds = runs.map((run) => run.id);
      await db.executionEvent.deleteMany({ where: { runId: { in: runIds } } });
      await db.processRecord.deleteMany({ where: { runId: { in: runIds } } });
      await db.executionQuotaHold.deleteMany({ where: { runId: { in: runIds } } });
      await db.executionRun.deleteMany({ where: { id: { in: runIds } } });
      const resourceFilters = [
        ...(conversationIds.length ? [{ conversationId: { in: conversationIds } }] : []),
        ...(exportIds.length ? [{ parentKey: { in: exportIds } }] : []),
      ];
      if (resourceFilters.length) await db.conversationLogResource.deleteMany({ where: { OR: resourceFilters } });
      await db.conversationExportJob.deleteMany({ where: { id: { in: exportIds } } });
      if (conversationIds.length) {
        await db.featureEvent.deleteMany({ where: { conversationId: { in: conversationIds } } });
        await db.assistantRun.deleteMany({ where: { anonIdHash: hashAnonId(visitorCookie) } });
        await db.deletionTombstone.deleteMany({ where: { conversationId: { in: conversationIds } } });
        await db.conversation.deleteMany({ where: { id: { in: conversationIds } } });
      }
      await db.auditRecord.deleteMany({ where: { targetId: { in: [deploymentId, conversationId, ...exportIds].filter((id): id is string => Boolean(id)) } } });
      await db.deploymentMember.deleteMany({ where: { agentRevisionId: { in: [firstRevisionId, secondRevisionId] } } });
      if (deploymentId) await db.agentDeployment.deleteMany({ where: { id: deploymentId } });
      await db.agentRevision.deleteMany({ where: { id: { in: [firstRevisionId, secondRevisionId] } } });
      await db.agentUnit.deleteMany({ where: { id: agentId } });
    }
  } finally {
    await app?.close();
    vi.unstubAllEnvs();
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  }
});

it('runs a two-member article conversation through history, export, deletion, and backup replay', async () => {
  await passEvidence(firstRevisionId);
  await passEvidence(secondRevisionId);

  const savedResponse = await post('/ops/deployments', {
    placementKey: 'post-detail', scopeSlug: articleSlug,
    members: [
      { agentRevisionId: firstRevisionId, isDefault: true },
      { agentRevisionId: secondRevisionId, isDefault: false },
    ],
    expectedGeneration: null,
  });
  expect(savedResponse.status).toBe(201);
  const draft = await savedResponse.json() as { id: string; generation: number };
  deploymentId = draft.id;

  const enabled = await post(`/ops/deployments/${deploymentId}/enable`, { expectedGeneration: draft.generation });
  expect(enabled.status).toBe(201);
  const manifestResponse = await fetch(`${baseUrl}/assistant/placements/post-detail/${articleSlug}`);
  const manifest = await manifestResponse.json() as {
    available: boolean; aiEnabled: boolean; generation: number;
    members: Array<{ key: string; isDefault: boolean; revision: number }>;
  };
  expect(manifest).toMatchObject({ available: true, aiEnabled: true, generation: draft.generation + 1 });
  const firstMember = manifest.members.find((member) => member.isDefault)!;
  const secondMember = manifest.members.find((member) => !member.isDefault)!;

  const ask = async (question: string, requestKey: string, memberKey: string) => {
    const response = await post('/assistant', {
      body: question, requestKey, placementKey: 'post-detail', scopeSlug: articleSlug,
      memberKey, deploymentGeneration: manifest.generation,
      raw: '访客不能通过问答写入内容', actor: 'owner',
    }, { 'content-type': 'application/json', cookie: `walker-anon=${visitorCookie}` });
    expect(response.status).toBe(201);
    return response.json() as Promise<{
      answer: string; citations: Array<{ slug: string }>; aiUsedFlag: boolean;
      conversationId: string; messageId: string; runId: string;
    }>;
  };

  const first = await ask('第一轮：这篇文章建议先做什么？', `${prefix}-ask-a`, firstMember.key);
  conversationId = first.conversationId;
  const second = await ask('第二轮：下一步如何核对？', `${prefix}-ask-b`, secondMember.key);
  expect(first).toMatchObject({ answer: '第一位成员：先核对公开正文。', aiUsedFlag: true, citations: [{ slug: articleSlug }] });
  expect(second).toMatchObject({ answer: '第二位成员：再按引用完成下一步。', aiUsedFlag: true, citations: [{ slug: articleSlug }] });
  expect(second.conversationId).toBe(conversationId);
  expect(runtimeCalls.map((call) => call.revisionId)).toEqual([firstRevisionId, secondRevisionId]);
  expect(runtimeCalls.map((call) => call.inputSessionId)).toEqual([null, null]);

  const switchEvent = await fetch(`${baseUrl}/assistant/events`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: `walker-anon=${visitorCookie}` },
    body: JSON.stringify({
      schemaVersion: 1, eventId: `${prefix}-member-switch`, event: 'member-switch',
      placementKey: 'post-detail', scopeSlug: articleSlug, memberKey: secondMember.key,
    }),
  });
  expect(switchEvent.status).toBe(201);

  const historyResponse = await fetch(`${baseUrl}/assistant/conversations/post-detail/${articleSlug}`, {
    headers: { cookie: `walker-anon=${visitorCookie}` },
  });
  const history = await historyResponse.json() as { conversationId: string; messages: Array<{ role: string; text: string; delivery: string; member?: { revision: number } | null }> };
  expect(history.conversationId).toBe(conversationId);
  expect(history.messages).toHaveLength(4);
  expect(history.messages.filter((message) => message.role === 'assistant').map((message) => message.member?.revision)).toEqual([1, 2]);
  expect(history.messages.map((message) => message.text)).toEqual([
    '第一轮：这篇文章建议先做什么？', '第一位成员：先核对公开正文。',
    '第二轮：下一步如何核对？', '第二位成员：再按引用完成下一步。',
  ]);
  expect(history.messages.filter((message) => message.role === 'assistant').every((message) => message.delivery === 'sent')).toBe(true);
  const otherVisitor = await (await fetch(`${baseUrl}/assistant/conversations/post-detail/${articleSlug}`, {
    headers: { cookie: `walker-anon=${'c'.repeat(64)}` },
  })).json();
  expect(otherVisitor).toMatchObject({ conversationId: null, messages: [] });

  const queryDenied = await fetch(`${baseUrl}/ops/conversations/${conversationId}`, { headers: { accept: 'application/json' } });
  expect(queryDenied.status).toBe(401);
  const listResponse = await fetch(`${baseUrl}/ops/conversations?contentSlug=${articleSlug}&placementKey=post-detail&agentId=${agentId}`, { headers });
  expect(listResponse.status).toBe(200);
  expect(await listResponse.json()).toMatchObject({ items: [expect.objectContaining({ conversationId })] });
  const detailResponse = await fetch(`${baseUrl}/ops/conversations/${conversationId}`, { headers });
  expect(detailResponse.status).toBe(200);
  const detail = await detailResponse.json() as {
    turns: Array<{ messages: Array<{ body: string }>; attempts: Array<{ agent: { revisionId: string } | null; run: { id: string } | null }> }>;
    interactions: Array<{ event: string }>;
  };
  expect(detail.turns).toHaveLength(2);
  expect(detail.turns.flatMap((turn) => turn.attempts.map((attempt) => attempt.agent?.revisionId))).toEqual([firstRevisionId, secondRevisionId]);
  expect(detail.interactions.map((event) => event.event)).toContain('member-switch');
  const publicRunIds = detail.turns.flatMap((turn) => turn.attempts.map((attempt) => attempt.run?.id).filter((id): id is string => Boolean(id)));
  const publicRuns = await db.executionRun.findMany({
    where: { id: { in: publicRunIds } },
    select: { origin: true, grantId: true, agentRevisionId: true },
    orderBy: { createdAt: 'asc' },
  });
  expect(publicRuns).toEqual([
    expect.objectContaining({ origin: 'public', grantId: null, agentRevisionId: firstRevisionId }),
    expect.objectContaining({ origin: 'public', grantId: null, agentRevisionId: secondRevisionId }),
  ]);

  const backupPath = path.join(tempRoot, `${prefix}.test.db`);
  await db.$executeRawUnsafe(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);

  const exportResponse = await post('/ops/exports', {
    format: 'json', filters: { contentSlug: articleSlug, placementKey: 'post-detail' },
  });
  expect(exportResponse.status).toBe(201);
  const job = await exportResponse.json() as { id: string; rowCount: number };
  exportIds.push(job.id);
  expect(job.rowCount).toBe(1);
  await waitForExport(job.id);
  const exportResponseDownload = await fetch(`${baseUrl}/ops/exports/${job.id}/download`, { headers });
  expect(exportResponseDownload.status).toBe(200);
  const exportBody = await exportResponseDownload.json() as { items: unknown[] };
  expect(exportBody.items).toHaveLength(1);
  expect(JSON.stringify(exportBody)).toContain('第一轮：这篇文章建议先做什么？');
  expect(JSON.stringify(exportBody)).toContain('第二位成员：再按引用完成下一步。');

  const deletedResponse = await fetch(`${baseUrl}/admin/log-resources/conversations/${conversationId}`, {
    method: 'DELETE', headers,
  });
  expect(deletedResponse.status).toBe(200);
  expect(await deletedResponse.json()).toMatchObject({ conversationId, state: 'completed' });
  expect((await fetch(`${baseUrl}/ops/conversations/${conversationId}`, { headers })).status).toBe(404);
  expect(await (await fetch(`${baseUrl}/assistant/conversations/post-detail/${articleSlug}`, {
    headers: { cookie: `walker-anon=${visitorCookie}` },
  })).json()).toMatchObject({ conversationId: null, messages: [] });
  expect((await fetch(`${baseUrl}/ops/exports/${job.id}/download`, { headers })).status).toBe(410);
  expect((await db.conversationExportJob.findUnique({ where: { id: job.id } }))?.status).toBe('REVOKED');
  await expect(access(path.join(exportDir, `${job.id}.json`))).rejects.toMatchObject({ code: 'ENOENT' });

  const restoredPath = path.join(tempRoot, `${prefix}-restored.test.db`);
  await copyFile(backupPath, restoredPath);
  const restoredDb = new PrismaClient({ datasources: { db: { url: `file:${restoredPath}` } } });
  try {
    const restoredPrisma: PrismaPort = { getClient: () => restoredDb, isWritable: () => true, ping: async () => true };
    const manifestStore = new FsDeletionManifestStore(manifestFile, manifestReplica);
    const replay = new DeletionManifestReplayService(restoredPrisma, manifestStore);
    expect(await restoredDb.conversationMessage.count({ where: { turn: { conversationId } } })).toBe(4);
    await replay.replay({ force: true });
    const restoredSpool = new FsAssistantEventSpool(`file:${restoredPath}`);
    const resources = new PrismaLogResourceRepository(restoredPrisma);
    const cleanup = new ConversationDeletionService(
      new PrismaOperationsJournal(restoredPrisma), resources,
      new PrismaConversationDeletionRepository(restoredPrisma),
      new LogResourceService(resources, restoredSpool),
      new FsLogResourceCleaner(restoredPrisma, restoredSpool, new FsTraceRepository(), { revokeAndRemove: async () => {} }),
      { findById: async () => null } as unknown as AgentExecutionRepositoryPort,
      { stopPublicRun: async () => ({ outcome: 'stopped', runId: '', state: 'CANCELLED' }) } as unknown as AgentExecutionService,
      manifestStore,
    );
    const replayedDelete = await cleanup.requestDelete(conversationId, 'restore');
    expect(replayedDelete.state).toBe('completed');
    expect(await restoredDb.conversation.findUnique({ where: { id: conversationId } })).toBeNull();
    expect(await restoredDb.conversationMessage.count({ where: { turn: { conversationId } } })).toBe(0);
    expect(await restoredDb.deletionTombstone.findUnique({ where: { conversationId } })).toMatchObject({ state: 'completed' });
    await replay.assertManifestCompleted();
  } finally {
    await restoredDb.$disconnect();
  }
}, 60_000);
