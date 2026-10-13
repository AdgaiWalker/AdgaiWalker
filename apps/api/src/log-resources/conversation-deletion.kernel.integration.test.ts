import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { APP_CONFIG } from '../config/config.port';
import { CONVERSATION_REPOSITORY, type ConversationRepositoryPort } from '../ports/conversation.repository';
import { ASSISTANT_REPOSITORY, type AssistantRepositoryPort } from '../ports/assistant.repository';
import { AGENT_EXECUTION_REPOSITORY, type AgentExecutionRepositoryPort } from '../ports/agent-execution.repository';
import { ASSISTANT_EVENT_SPOOL, type AssistantEventSpoolPort } from '../ports/assistant-event-spool.port';
import { TRACE_WRITER, type TraceWriterPort } from '../ports/trace.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { ConversationDeletionService } from './conversation-deletion.service';
import { dshSessionDirectory } from '../runtime/dsh-session-resource-path';

const prefix = `v18-delete-${randomUUID().replaceAll('-', '')}`;
const conversationId = `${prefix}-conversation`;
const otherConversationId = `${prefix}-other`;
const ownerHash = `${prefix}-owner`;
const agentId = `${prefix}-agent`;
const revisionId = `${prefix}-revision`;
const turnId = `${prefix}-turn`;
const attemptId = `${prefix}-attempt`;
const assistantMessageId = `${prefix}-assistant-message`;
const assistantRunId = `${prefix}-assistant-run`;
const executionRunId = `run_${prefix}`;
const sessionId = `${prefix}-session`;
const eventId = `${prefix}-event`;
const spoolEventId = `${prefix}-spool-event`;
const adminToken = `${prefix}-admin-token`;

let app: INestApplication;
let baseUrl = '';
let db: PrismaClient;
let conversations: ConversationRepositoryPort;
let assistant: AssistantRepositoryPort;
let executions: AgentExecutionRepositoryPort;
let trace: TraceWriterPort;
let spool: AssistantEventSpoolPort;
let deletion: ConversationDeletionService;
let modelHome = '';
let runsDir = '';

beforeAll(async () => {
  modelHome = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-v18-model-home-'));
  runsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-v18-runs-'));
  vi.stubEnv('WALKER_ADMIN_TOKEN', adminToken);
  vi.stubEnv('WALKER_MODEL_HOME', modelHome);
  vi.stubEnv('WALKER_RUNS_DIR', runsDir);
  vi.stubEnv('WALKER_DELETION_MANIFEST_PATH', path.join(modelHome, 'deletion-manifest.json'));

  const testingModule = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue({
      getDatabaseUrl: () => process.env.DATABASE_URL ?? '',
      isAiEnabled: () => false,
      getHost: () => '127.0.0.1',
      getPort: () => 8788,
      getNodeEnv: () => 'test',
      getWorkRootDir: () => path.join(modelHome, 'works'),
      getWorkMaxUploadBytes: () => 1024,
    })
    .overrideProvider(ASSISTANT_EVENT_SPOOL)
    .useValue(new (await import('../adapters/fs-assistant-event-spool')).FsAssistantEventSpool(process.env.DATABASE_URL))
    .compile();
  app = testingModule.createNestApplication({ logger: false });
  db = testingModule.get<PrismaPort>(PRISMA).getClient()!;
  conversations = testingModule.get(CONVERSATION_REPOSITORY);
  assistant = testingModule.get(ASSISTANT_REPOSITORY);
  executions = testingModule.get(AGENT_EXECUTION_REPOSITORY);
  trace = testingModule.get(TRACE_WRITER);
  spool = testingModule.get(ASSISTANT_EVENT_SPOOL);
  deletion = testingModule.get(ConversationDeletionService);
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
}, 30_000);

afterAll(async () => {
  const runIds = [executionRunId];
  await db?.executionEvent.deleteMany({ where: { runId: { in: runIds } } });
  await db?.processRecord.deleteMany({ where: { runId: { in: runIds } } });
  await db?.executionQuotaHold.deleteMany({ where: { runId: { in: runIds } } });
  await db?.conversationLogResource.deleteMany({ where: { conversationId: { in: [conversationId, otherConversationId] } } });
  await db?.deletionTombstone.deleteMany({ where: { conversationId: conversationId } });
  await db?.auditRecord.deleteMany({ where: { targetType: 'conversation', targetId: conversationId } });
  await db?.featureEvent.deleteMany({ where: { id: eventId } });
  await db?.assistantRun.deleteMany({ where: { id: assistantRunId } });
  await db?.conversation.deleteMany({ where: { id: { in: [conversationId, otherConversationId] } } });
  await db?.executionRun.deleteMany({ where: { id: { in: runIds } } });
  await db?.agentRevision.deleteMany({ where: { id: revisionId } });
  await db?.agentUnit.deleteMany({ where: { id: agentId } });
  await app?.close();
  vi.unstubAllEnvs();
  if (modelHome) await fs.rm(modelHome, { recursive: true, force: true });
  if (runsDir) await fs.rm(runsDir, { recursive: true, force: true });
});

describe('conversation deletion kernel/API', () => {
  it('tombstones, stops/clears registered copies, preserves audit and unrelated conversations', async () => {
    await db.agentUnit.create({ data: { id: agentId, name: 'Delete fixture', prompt: 'unused' } });
    await db.agentRevision.create({
      data: { id: revisionId, agentId, version: 1, prompt: 'unused', modelId: 'test-model', toolProfile: {}, schemaVersion: 1, configHash: `${prefix}-config` },
    });
    await conversations.create({ id: conversationId, anonId: ownerHash, placementKey: 'post-detail', scopeSlug: 'post-a' });
    const turn = await conversations.addVisitorMessage({
      conversationId, turnId, messageId: `${prefix}-visitor-message`, requestKey: `${prefix}-request`, body: `${prefix}-visitor-body`,
    });
    await conversations.addAttempt({ id: attemptId, turnId: turn.id, agentRevisionId: revisionId, runId: executionRunId });
    await conversations.addAssistantMessage({ id: assistantMessageId, turnId: turn.id, attemptId, body: `${prefix}-assistant-body` });
    await conversations.linkSdkSession({ id: `${prefix}-sdk-link`, conversationId, agentRevisionId: revisionId, sdkSessionId: sessionId });
    await assistant.upsertSession({ id: `${prefix}-assistant-session`, anonId: ownerHash, sessionId, runner: 'harness', agentRevisionId: revisionId, conversationId });
    await assistant.saveRun({
      id: assistantRunId, sessionId, question: `${prefix}-legacy-question`, answer: `${prefix}-legacy-answer`, citations: '[]',
      aiUsedFlag: true, elapsedMs: 5, source: 'assistant-panel', anonIdHash: ownerHash, requestKey: turn.requestKey, conversationId,
    });
    await executions.submitIfAbsent({
      id: executionRunId, kind: 'chat', origin: 'public', actor: ownerHash, actorScope: `public:${ownerHash}`,
      agentRevisionId: revisionId, deploymentId: null, placementKey: 'post-detail', deploymentGeneration: 1,
      contentSnapshotId: 'a'.repeat(64), requestKey: `${prefix}-execution`, inputHash: 'b'.repeat(64),
      resourceScope: { kind: 'content', ids: ['post-a'] }, input: `${prefix}-execution-prompt`, deadline: null, conversationId,
    });
    await db.executionRun.update({ where: { id: executionRunId }, data: { state: 'SUCCEEDED' } });
    await executions.appendEvent({ runId: executionRunId, kind: 'text', text: `${prefix}-execution-output` });
    await trace.append(executionRunId, { type: 'run.start', payload: { message: `${prefix}-trace-body` } });
    await conversations.recordEvent({
      id: eventId, eventId: `${prefix}-event-key`, featureKey: 'assistant.interaction', event: 'open', actorType: 'visitor', conversationId,
    });

    const agentHome = path.join(modelHome, 'agents', agentId);
    const sessionDirectory = dshSessionDirectory(agentHome, path.join(agentHome, 'materials'), sessionId);
    await fs.mkdir(sessionDirectory, { recursive: true });
    await fs.writeFile(path.join(sessionDirectory, 'session.jsonl.zstd'), `${prefix}-native-body`);
    await spool.enqueue({
      id: `${prefix}-spool-row`, eventId: spoolEventId, featureKey: 'assistant.interaction', event: 'open',
      actorType: 'visitor', conversationId, props: { scopeSlug: 'post-a' },
    });
    await conversations.create({ id: otherConversationId, anonId: `${prefix}-other`, placementKey: 'post-detail', scopeSlug: 'post-b' });
    const otherTurn = await conversations.addVisitorMessage({
      conversationId: otherConversationId, turnId: `${prefix}-other-turn`, messageId: `${prefix}-other-message`,
      requestKey: `${prefix}-other-request`, body: `${prefix}-keep-this-body`,
    });

    const denied = await fetch(`${baseUrl}/admin/log-resources/conversations/${conversationId}`, { headers: { accept: 'application/json' } });
    expect(denied.status).toBe(401);
    const crossOrigin = await fetch(`${baseUrl}/admin/log-resources/conversations/${conversationId}`, {
      method: 'DELETE', headers: { accept: 'application/json', origin: 'https://attacker.example', 'x-admin-token': adminToken },
    });
    expect(crossOrigin.status).toBe(403);

    const response = await fetch(`${baseUrl}/admin/log-resources/conversations/${conversationId}`, {
      method: 'DELETE', headers: { accept: 'application/json', 'x-admin-token': adminToken },
    });
    expect(response.status).toBe(200);
    const task = await response.json() as { id: string; conversationId: string; requestedAt: string; state: string };
    expect(task).toMatchObject({ conversationId, state: 'completed' });
    const deletionManifest = JSON.parse(await fs.readFile(path.join(modelHome, 'deletion-manifest.json'), 'utf8')) as {
      entries: Array<{ tombstoneId: string; conversationId: string }>;
    };
    expect(deletionManifest.entries).toContainEqual({ tombstoneId: task.id, conversationId, requestedAt: task.requestedAt });
    const status = await fetch(`${baseUrl}/admin/log-deletions/${task.id}`, {
      headers: { accept: 'application/json', 'x-admin-token': adminToken },
    });
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ id: task.id, state: 'completed' });

    expect(await db.conversation.findUnique({ where: { id: conversationId } })).toBeNull();
    expect(await db.conversation.findUnique({ where: { id: otherConversationId } })).not.toBeNull();
    expect(await db.conversationMessage.findUnique({ where: { id: assistantMessageId } })).toBeNull();
    expect(await db.assistantRun.findUnique({ where: { id: assistantRunId } })).toBeNull();
    expect(await db.executionRun.findUnique({ where: { id: executionRunId } })).toBeNull();
    expect(await db.featureEvent.findUnique({ where: { id: eventId } })).toBeNull();
    expect(await db.conversationLogResource.count({ where: { conversationId } })).toBe(0);
    await expect(fs.stat(sessionDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(path.join(runsDir, executionRunId, 'trace.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await spool.listResources()).some((resource) => resource.eventId === spoolEventId)).toBe(false);
    expect(await db.conversationMessage.findUnique({ where: { id: `${prefix}-other-message` } })).toMatchObject({ turnId: otherTurn.id, body: `${prefix}-keep-this-body` });

    const audit = await db.auditRecord.findFirst({ where: { action: 'conversation-delete-requested', targetId: conversationId } });
    expect(audit).toMatchObject({ actor: 'owner', outcome: 'pending' });
    expect(JSON.stringify(audit)).not.toContain('visitor-body');
    expect(JSON.stringify(audit)).not.toContain('assistant-body');

    await expect(conversations.create({ id: conversationId, anonId: ownerHash, placementKey: 'post-detail', scopeSlug: 'post-a' }))
      .rejects.toMatchObject({ response: { code: 'conversation-deleted' } });
  });
});
