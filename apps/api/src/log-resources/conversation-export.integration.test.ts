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
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { ASSISTANT_EVENT_SPOOL } from '../ports/assistant-event-spool.port';
import { FsAssistantEventSpool } from '../adapters/fs-assistant-event-spool';
import { ConversationDeletionService } from './conversation-deletion.service';

// Keep identifiers free of digit runs so redaction cannot mistake a random UUID for a mobile number.
const prefix = `v21-export-http-${randomUUID().replace(/[0-9]/g, 'g')}`;
const token = `${prefix}-admin`;
const conversationId = `${prefix}-conversation`;
const turnId = `${prefix}-turn`;
const lateConversationId = `${prefix}-late`;
const lateTurnId = `${prefix}-late-turn`;
let app: INestApplication;
let baseUrl = '';
let db: PrismaClient;
let root = '';
let exportDir = '';
let modelHome = '';
let runsDir = '';
const exportIds: string[] = [];

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-v21-export-'));
  exportDir = path.join(root, 'exports');
  modelHome = path.join(root, 'model-home');
  runsDir = path.join(root, 'runs');
  vi.stubEnv('WALKER_ADMIN_TOKEN', token);
  vi.stubEnv('WALKER_EXPORT_DIR', exportDir);
  vi.stubEnv('WALKER_MODEL_HOME', modelHome);
  vi.stubEnv('WALKER_RUNS_DIR', runsDir);
  vi.stubEnv('WALKER_STARTUP_RECONCILIATION', '1');
  vi.stubEnv('WALKER_DELETION_MANIFEST_PATH', path.join(root, 'deletion-manifest.json'));
  const testingModule = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue({
      getDatabaseUrl: () => process.env.DATABASE_URL ?? '',
      isAiEnabled: () => false,
      getHost: () => '127.0.0.1',
      getPort: () => 8788,
      getNodeEnv: () => 'test',
      getWorkRootDir: () => path.join(root, 'works'),
      getWorkMaxUploadBytes: () => 1024,
    })
    .overrideProvider(ASSISTANT_EVENT_SPOOL)
    .useValue(new FsAssistantEventSpool(process.env.DATABASE_URL))
    .compile();
  app = testingModule.createNestApplication({ logger: false });
  db = testingModule.get<PrismaPort>(PRISMA).getClient()!;
  await db.conversation.create({ data: {
    id: conversationId, anonId: `${prefix}-owner`, placementKey: 'post-detail', scopeSlug: `${prefix}-post`,
  } });
  await db.conversationTurn.create({ data: {
    id: turnId, conversationId, seq: 1, requestKey: `${prefix}-request`,
  } });
  await db.conversationMessage.createMany({ data: [
    { id: `${prefix}-question`, turnId, role: 'visitor', body: '=HYPERLINK("x")', delivery: 'ack' },
    { id: `${prefix}-answer`, turnId, role: 'assistant', body: '联系 user@example.com', delivery: 'ack' },
  ] });
  await app.init();
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
}, 30_000);

afterAll(async () => {
  await app?.close();
  await db?.conversationLogResource.deleteMany({ where: { OR: [{ conversationId: { in: [conversationId, lateConversationId] } }, { parentKey: { in: exportIds } }] } });
  await db?.auditRecord.deleteMany({ where: { targetId: { in: exportIds } } });
  await db?.conversationExportJob.deleteMany({ where: { id: { in: exportIds } } });
  await db?.deletionTombstone.deleteMany({ where: { conversationId: conversationId } });
  await db?.conversation.deleteMany({ where: { id: { in: [conversationId, lateConversationId] } } });
  await db?.$disconnect();
  vi.unstubAllEnvs();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

describe('conversation export API', () => {
  it('exports the frozen query snapshot, protects and expires downloads, then revokes the local file on conversation deletion', async () => {
    const unauthorized = await fetch(`${baseUrl}/ops/exports`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ format: 'json', filters: { contentSlug: `${prefix}-post` } }),
    });
    expect(unauthorized.status).toBe(401);

    const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-admin-token': token };
    const jsonResponse = await fetch(`${baseUrl}/ops/exports`, {
      method: 'POST', headers,
      body: JSON.stringify({ format: 'json', filters: { contentSlug: `${prefix}-post` } }),
    });
    expect(jsonResponse.status).toBe(201);
    const jsonJob = await jsonResponse.json() as { id: string; rowCount: number; state: string };
    exportIds.push(jsonJob.id);
    expect(jsonJob.rowCount).toBe(1);

    await db.conversation.create({ data: {
      id: lateConversationId, anonId: `${prefix}-late-owner`, placementKey: 'post-detail', scopeSlug: `${prefix}-post`,
    } });
    await db.conversationTurn.create({ data: { id: lateTurnId, conversationId: lateConversationId, seq: 1, requestKey: `${prefix}-late-request` } });
    await db.conversationMessage.create({ data: { id: `${prefix}-late-question`, turnId: lateTurnId, role: 'visitor', body: '创建任务之后的问题', delivery: 'ack' } });

    const jsonReady = await waitForState(jsonJob.id, headers, 'READY');
    expect(jsonReady.filters.contentSlug).toBe(`${prefix}-post`);
    expect(jsonReady.fields).toContain('turns');
    const deniedDownload = await fetch(`${baseUrl}/ops/exports/${jsonJob.id}/download`);
    expect(deniedDownload.status).toBe(401);
    const jsonDownload = await fetch(`${baseUrl}/ops/exports/${jsonJob.id}/download`, { headers });
    expect(jsonDownload.status).toBe(200);
    const jsonBody = await jsonDownload.json() as { metadata: { rowCount: number }; items: Array<{ conversationId: string; turns: Array<{ messages: Array<{ body: string }> }> }> };
    expect(jsonBody.metadata.rowCount).toBe(1);
    expect(jsonBody.items.map((item) => item.conversationId)).toEqual([conversationId]);
    expect(JSON.stringify(jsonBody)).not.toContain('user@example.com');
    expect(JSON.stringify(jsonBody)).toContain('[redacted-email]');
    expect(await db.auditRecord.count({ where: {
      targetType: 'conversation-export', targetId: jsonJob.id, action: 'conversation-export-download-authorized', outcome: 'authorized',
    } })).toBe(1);
    const exportAudit = await db.auditRecord.findMany({ where: { targetType: 'conversation-export', targetId: jsonJob.id } });
    expect(JSON.stringify(exportAudit)).not.toContain('=HYPERLINK');
    expect(JSON.stringify(exportAudit)).not.toContain('user@example.com');

    const csvResponse = await fetch(`${baseUrl}/ops/exports`, {
      method: 'POST', headers,
      body: JSON.stringify({ format: 'csv', filters: { contentSlug: `${prefix}-post` } }),
    });
    expect(csvResponse.status).toBe(201);
    const csvJob = await csvResponse.json() as { id: string; rowCount: number };
    exportIds.push(csvJob.id);
    expect(csvJob.rowCount).toBe(2);
    await waitForState(csvJob.id, headers, 'READY');
    const csvDownload = await fetch(`${baseUrl}/ops/exports/${csvJob.id}/download`, { headers });
    expect(csvDownload.status).toBe(200);
    const csv = await csvDownload.text();
    expect(csv).toMatch(/"recordType".*"snapshotAt".*"rowCount"/);
    expect(csv).toContain('"metadata"');
    expect(csv).toContain('"conversation"');
    expect(csv).toMatch(/"metadata","[^"]+","[^"]+","2"/);
    expect(csv).toContain("'=HYPERLINK");

    await db.conversationExportJob.update({ where: { id: jsonJob.id }, data: { snapshotAt: new Date(0) } });
    const expired = await fetch(`${baseUrl}/ops/exports/${jsonJob.id}/download`, { headers });
    expect(expired.status).toBe(410);
    const expiredStatus = await fetch(`${baseUrl}/ops/exports/${jsonJob.id}`, { headers });
    expect(await expiredStatus.json()).toMatchObject({
      state: 'EXPIRED', filters: { keyword: null, contentSlug: null, placementKey: null },
    });
    expect(await fs.access(path.join(exportDir, `${jsonJob.id}.json`)).then(() => true, () => false)).toBe(false);

    const deleted = await app.get(ConversationDeletionService).requestDelete(conversationId, 'owner');
    expect(deleted.state).toBe('completed');
    expect((await db.conversationExportJob.findUnique({ where: { id: csvJob.id } }))?.status).toBe('REVOKED');
    expect(await fs.access(path.join(exportDir, `${csvJob.id}.csv`)).then(() => true, () => false)).toBe(false);
    expect((await fetch(`${baseUrl}/ops/exports/${csvJob.id}/download`, { headers })).status).toBe(410);
  }, 30_000);
});

async function waitForState(id: string, headers: Record<string, string>, expected: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${baseUrl}/ops/exports/${id}`, { headers });
    expect(response.status).toBe(200);
    const job = await response.json() as { state: string; filters: Record<string, string | null>; fields: string[] };
    if (job.state === expected) return job;
    if (job.state === 'FAILED' || job.state === 'REVOKED' || job.state === 'EXPIRED') throw new Error(`导出提前结束：${job.state}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`导出未进入状态 ${expected}`);
}
