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

const prefix = `v20-http-${randomUUID().replaceAll('-', '')}`;
const token = `${prefix}-admin`;
const visibleConversation = `${prefix}-visible`;
const deletedConversation = `${prefix}-deleted`;
let app: INestApplication;
let baseUrl = '';
let db: PrismaClient;
let modelHome = '';
let runsDir = '';

beforeAll(async () => {
  modelHome = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-v20-query-home-'));
  runsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-v20-query-runs-'));
  vi.stubEnv('WALKER_ADMIN_TOKEN', token);
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
    .useValue(new FsAssistantEventSpool(process.env.DATABASE_URL))
    .compile();
  app = testingModule.createNestApplication({ logger: false });
  db = testingModule.get<PrismaPort>(PRISMA).getClient()!;

  for (const [conversationId, scopeSlug, body] of [
    [visibleConversation, 'post-a', '访客询问退款到账时间'],
    [deletedConversation, 'post-a', '已经申请删除的退款正文'],
  ]) {
    await db.conversation.create({ data: {
      id: conversationId, anonId: `${prefix}-owner`, placementKey: 'post-detail', scopeSlug,
    } });
    const turn = await db.conversationTurn.create({
      data: { id: `${conversationId}-turn`, conversationId, seq: 1, requestKey: `${conversationId}-key` },
    });
    await db.conversationMessage.create({
      data: { id: `${conversationId}-message`, turnId: turn.id, role: 'visitor', body, delivery: 'ack' },
    });
  }
  await db.deletionTombstone.create({ data: { conversationId: deletedConversation, state: 'blocked' } });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
}, 30_000);

afterAll(async () => {
  const ids = [visibleConversation, deletedConversation];
  await db?.conversationLogResource.deleteMany({ where: { conversationId: { in: ids } } });
  await db?.deletionTombstone.deleteMany({ where: { conversationId: { in: ids } } });
  await db?.conversation.deleteMany({ where: { id: { in: ids } } });
  await app?.close();
  vi.unstubAllEnvs();
  if (modelHome) await fs.rm(modelHome, { recursive: true, force: true });
  if (runsDir) await fs.rm(runsDir, { recursive: true, force: true });
});

describe('conversation query API', () => {
  it('requires owner credentials, applies server filters, and hides tombstoned bodies', async () => {
    const denied = await fetch(`${baseUrl}/ops/conversations?keyword=退款`);
    expect(denied.status).toBe(401);

    const response = await fetch(`${baseUrl}/ops/conversations?keyword=${encodeURIComponent('退款')}&contentSlug=post-a&placementKey=post-detail`, {
      headers: { 'x-admin-token': token, accept: 'application/json' },
    });
    expect(response.status).toBe(200);
    const page = await response.json() as { items: Array<{ conversationId: string; latestQuestion: string | null }> };
    expect(page.items).toEqual([expect.objectContaining({
      conversationId: visibleConversation, latestQuestion: '访客询问退款到账时间',
    })]);
    expect(JSON.stringify(page)).not.toContain('已经申请删除的退款正文');

    const hidden = await fetch(`${baseUrl}/ops/conversations/${deletedConversation}`, {
      headers: { 'x-admin-token': token, accept: 'application/json' },
    });
    expect(hidden.status).toBe(404);
  });

  it('rejects unsupported query limits instead of silently changing pagination', async () => {
    const response = await fetch(`${baseUrl}/ops/conversations?limit=20`, {
      headers: { 'x-admin-token': token, accept: 'application/json' },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'conversation-query-invalid' });
  });
});
