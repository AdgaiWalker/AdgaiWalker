import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { READ_ONLY_PROFILE } from '@walker/shared';
import { AppModule } from '../app.module';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { CONTENT_FILE_REPOSITORY, type ContentFileRepositoryPort } from '../ports/content-file.repository';
import { CONTENT_CHANGE_REPOSITORY, type ContentChangeRepositoryPort } from '../ports/content-change.repository';
import { CONTENT_MUTATION_SERVICE, type ContentMutationPort } from '../ports/content-mutation.port';
import { CANDIDATE_FILE_REPOSITORY, type CandidateFileRepositoryPort } from '../ports/candidate-file.repository';
import { RUNTIME_PORT, type RuntimePort } from '../ports/runtime.port';

const token = 'propose-test-token';
const authHeaders = { 'x-admin-token': token, 'content-type': 'application/json' };
const agentId = 'c08-propose-agent';
const revisionId = 'c08-propose-revision';

let app: INestApplication;
let base: string;
let contentDir: string;
let candidateDir: string;
let moduleRef: TestingModule;

const mockRuntimeOutput = {
  shouldFail: false,
  /** 模拟真实模型耗时：生成整篇候选正文远不止几秒 */
  delayMs: 0,
  text: '---\ntitle: 修改后的文章标题\ntype: post\n---\n# 这是 Agent 生成的新正文\n增加的重点内容\n',
};

const mockRuntime: RuntimePort = {
  async start() {},
  async run(request) {
    if (mockRuntimeOutput.shouldFail) {
      throw new Error('agent-model-mock-failure');
    }
    if (mockRuntimeOutput.delayMs) await new Promise((resolve) => setTimeout(resolve, mockRuntimeOutput.delayMs));
    request.observe?.({ kind: 'text', text: mockRuntimeOutput.text });
    return {
      ok: true,
      sessionId: 'session-c08',
      text: mockRuntimeOutput.text,
      json: null,
      outputKind: 'json',
      usage: { inputTokens: 100, outputTokens: 200, cacheReadTokens: null },
    };
  },
  observe() {
    return () => undefined;
  },
  async close() {
    return { exited: true };
  },
};

describe('ContentMutationService.propose (C08 后台生成内容候选)', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c08-content-'));
    candidateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c08-candidates-'));
    vi.stubEnv('WALKER_ADMIN_TOKEN', token);
    vi.stubEnv('CONTENT_LOG_DIR', contentDir);
    vi.stubEnv('WALKER_CANDIDATES_DIR', candidateDir);
    vi.stubEnv('AI_ENABLED', 'true');

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RUNTIME_PORT).useValue(mockRuntime)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();

    const db = app.get<PrismaPort>(PRISMA).getClient()!;
    await db.agentUnit.create({ data: { id: agentId, name: '改稿 Agent', prompt: '你是一个文章修改助手' } });
    await db.agentRevision.create({
      data: {
        id: revisionId,
        agentId,
        version: 1,
        prompt: '你是一个文章修改助手',
        modelId: 'deepseek-chat',
        toolProfile: READ_ONLY_PROFILE,
        schemaVersion: 1,
        configHash: 'c'.repeat(64),
      },
    });
  });

  afterAll(async () => {
    const db = app?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.contentChange.deleteMany({ where: { targetSlug: { startsWith: 'c08-' } } });
      await db.executionEvent.deleteMany({});
      await db.processRecord.deleteMany({});
      await db.executionQuotaHold.deleteMany({});
      await db.executionRun.deleteMany({});
      await db.authorizationGrant.deleteMany({ where: { agentId } });
      await db.agentRevision.deleteMany({ where: { agentId } });
      await db.agentUnit.deleteMany({ where: { id: agentId } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    if (candidateDir) await fs.rm(candidateDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    mockRuntimeOutput.shouldFail = false;
    mockRuntimeOutput.delayMs = 0;
    mockRuntimeOutput.text = '---\ntitle: 修改后的文章标题\ntype: post\n---\n# 这是 Agent 生成的新正文\n增加的重点内容\n';
  });

  it('固定输入正文版本和 L1 授权，调用 Agent 后保存不可变候选与来源 run，正本 hash 始终不变', async () => {
    const slug = 'c08-article-1';
    const filePath = path.join(contentDir, `${slug}.md`);
    const initialRaw = '---\ntitle: 原始文章\ntype: post\n---\n# 原文第一行\n原文第二行\n';
    await fs.writeFile(filePath, initialRaw, 'utf8');

    const files = app.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
    const initialDoc = await files.get(slug);
    expect(initialDoc).not.toBeNull();
    const expectedBaseHash = initialDoc!.hash;

    // 创建合规的 L1 授权
    const grantRes = await fetch(`${base}/ops/grants`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        requestKey: 'grant-req-c08-01',
        level: 'L1',
        agentId,
        actions: ['content:read', 'agent:run', 'content:propose'],
        resourceScope: { kind: 'content', ids: [slug] },
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        runLimit: 10,
        usageLimit: 50_000,
      }),
    });
    expect(grantRes.status).toBe(201);
    const grant = await grantRes.json() as { id: string };

    const mutation = app.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);
    const change = await mutation.propose({
      slug,
      agentId,
      instruction: '为文章增加核心重点段落',
      grantId: grant.id,
      requestKey: 'propose-req-001',
      actor: 'owner',
    });

    // 候选状态为 PROPOSED，固定版本 hash
    expect(change.state).toBe('PROPOSED');
    expect(change.baseHash).toBe(expectedBaseHash);
    expect(change.target.slug).toBe(slug);
    expect(change.sourceRunId).toBeTruthy();

    // 候选文件已保存到独立仓储，可成功读取
    const candidateFiles = app.get<CandidateFileRepositoryPort>(CANDIDATE_FILE_REPOSITORY);
    const candRecord = await candidateFiles.read(change.candidateRef);
    expect(candRecord).not.toBeNull();
    expect(candRecord?.hash).toBe(change.candidateHash);
    expect(candRecord?.raw).toContain('这是 Agent 生成的新正文');

    // 来源 run 存在且状态为 SUCCEEDED
    const db = app.get<PrismaPort>(PRISMA).getClient()!;
    const run = await db.executionRun.findUnique({ where: { id: change.sourceRunId! } });
    expect(run).not.toBeNull();
    expect(run?.state).toBe('SUCCEEDED');

    // 核心断言：正本文件内容与 hash 绝不发生改变
    const docAfter = await files.get(slug);
    expect(docAfter?.hash).toBe(expectedBaseHash);
    expect(docAfter?.raw).toBe(initialRaw);
  });

  it('模型慢一点也不会被判成失败：等待跟随运行自己的 deadline，不自己拍窗口', async () => {
    const slug = 'c08-article-slow';
    const filePath = path.join(contentDir, `${slug}.md`);
    await fs.writeFile(filePath, '---\ntitle: 慢文章\ntype: post\n---\n内容\n', 'utf8');

    const grantRes = await fetch(`${base}/ops/grants`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        requestKey: 'grant-req-c08-slow',
        level: 'L1',
        agentId,
        actions: ['content:read', 'agent:run', 'content:propose'],
        resourceScope: { kind: 'content', ids: [slug] },
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        runLimit: 10,
        usageLimit: 50_000,
      }),
    });
    const grant = await grantRes.json() as { id: string };

    // 4 秒 > 历史上那段固定 60 × 50ms 的窗口（约 3 秒）——旧实现会在这里抛 500
    mockRuntimeOutput.delayMs = 4_000;
    const mutation = app.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);
    const change = await mutation.propose({
      slug, agentId, instruction: '加一段重点', grantId: grant.id,
      requestKey: 'propose-req-slow', actor: 'owner',
    });

    expect(change.state).toBe('PROPOSED');
    const db = app.get<PrismaPort>(PRISMA).getClient()!;
    const run = await db.executionRun.findUnique({ where: { id: change.sourceRunId! } });
    expect(run?.state).toBe('SUCCEEDED');
  });

  it('缺少有效 L1 授权（未授权/已过期/无 content:propose）时拒绝执行', async () => {
    const slug = 'c08-article-unauthorized';
    const filePath = path.join(contentDir, `${slug}.md`);
    await fs.writeFile(filePath, '---\ntitle: 试探文章\ntype: post\n---\n内容\n', 'utf8');

    // L0 授权（缺少 content:propose）
    const grantRes = await fetch(`${base}/ops/grants`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        requestKey: 'grant-req-c08-l0',
        level: 'L0',
        agentId,
        actions: ['content:read', 'agent:run'],
        resourceScope: { kind: 'content', ids: [slug] },
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        runLimit: 10,
        usageLimit: 50_000,
      }),
    });
    const l0Grant = await grantRes.json() as { id: string };

    const mutation = app.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);
    await expect(
      mutation.propose({
        slug,
        agentId,
        instruction: '改稿',
        grantId: l0Grant.id,
        requestKey: 'propose-req-denied',
        actor: 'owner',
      }),
    ).rejects.toThrowError(/grant-denied|403|授权/i);
  });

  it('模型失败时记录失败 run，坏输出不成为候选，原文 hash 始终不变', async () => {
    const slug = 'c08-article-fail';
    const filePath = path.join(contentDir, `${slug}.md`);
    const initialRaw = '---\ntitle: 稳定文章\ntype: post\n---\n不能被破坏的正文\n';
    await fs.writeFile(filePath, initialRaw, 'utf8');

    const grantRes = await fetch(`${base}/ops/grants`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        requestKey: 'grant-req-c08-fail',
        level: 'L1',
        agentId,
        actions: ['content:read', 'agent:run', 'content:propose'],
        resourceScope: { kind: 'content', ids: [slug] },
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        runLimit: 10,
        usageLimit: 50_000,
      }),
    });
    const grant = await grantRes.json() as { id: string };

    // 触发模型失败
    mockRuntimeOutput.shouldFail = true;

    const mutation = app.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);
    await expect(
      mutation.propose({
        slug,
        agentId,
        instruction: '导致报错的指令',
        grantId: grant.id,
        requestKey: 'propose-req-will-fail',
        actor: 'owner',
      }),
    ).rejects.toThrow();

    // 检查：失败 run 依然被持久化，保留证据
    const db = app.get<PrismaPort>(PRISMA).getClient()!;
    const failedRun = await db.executionRun.findFirst({
      where: { grantId: grant.id, actor: 'owner' },
      orderBy: { createdAt: 'desc' },
    });
    expect(failedRun).not.toBeNull();
    expect(failedRun?.state).toBe('FAILED');

    // 检查：未产生坏候选
    const changes = app.get<ContentChangeRepositoryPort>(CONTENT_CHANGE_REPOSITORY);
    const change = await changes.findByRequestKey('propose-req-will-fail');
    expect(change).toBeNull();

    // 检查：原文未被修改
    const files = app.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
    const docAfter = await files.get(slug);
    expect(docAfter?.raw).toBe(initialRaw);
  });

  it('模型坏输出（无 frontmatter 或无改动）不成为可批准候选', async () => {
    const slug = 'c08-article-bad-output';
    const filePath = path.join(contentDir, `${slug}.md`);
    const initialRaw = '---\ntitle: 正常正文\ntype: post\n---\n内容\n';
    await fs.writeFile(filePath, initialRaw, 'utf8');

    const grantRes = await fetch(`${base}/ops/grants`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        requestKey: 'grant-req-c08-bad',
        level: 'L1',
        agentId,
        actions: ['content:read', 'agent:run', 'content:propose'],
        resourceScope: { kind: 'content', ids: [slug] },
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        runLimit: 10,
        usageLimit: 50_000,
      }),
    });
    const grant = await grantRes.json() as { id: string };

    // 坏输出 1：无 frontmatter 的纯文本回答
    mockRuntimeOutput.text = '我给您改好了，但是没有 frontmatter！';

    const mutation = app.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);
    await expect(
      mutation.propose({
        slug,
        agentId,
        instruction: '坏输出指令',
        grantId: grant.id,
        requestKey: 'propose-bad-1',
        actor: 'owner',
      }),
    ).rejects.toThrowError(/frontmatter/i);

    // 坏输出 2：内容与原文一模一样无任何改动
    mockRuntimeOutput.text = initialRaw;
    await expect(
      mutation.propose({
        slug,
        agentId,
        instruction: '未做改动的指令',
        grantId: grant.id,
        requestKey: 'propose-bad-2',
        actor: 'owner',
      }),
    ).rejects.toThrowError(/未产生有效变更|unchanged|一致/i);

    // 原文保持不变
    const files = app.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
    expect((await files.get(slug))?.raw).toBe(initialRaw);
  });

  it('HTTP /ops/content-changes 端点支持 POST 创建与 GET 列表/详情查询', async () => {
    const slug = 'c08-article-http';
    const filePath = path.join(contentDir, `${slug}.md`);
    await fs.writeFile(filePath, '---\ntitle: HTTP测试文章\ntype: post\n---\n正文\n', 'utf8');

    const grantRes = await fetch(`${base}/ops/grants`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        requestKey: 'grant-req-c08-http',
        level: 'L1',
        agentId,
        actions: ['content:read', 'agent:run', 'content:propose'],
        resourceScope: { kind: 'content', ids: [slug] },
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        runLimit: 10,
        usageLimit: 50_000,
      }),
    });
    const grant = await grantRes.json() as { id: string };

    // 1. 匿名访问 POST 被拒 401
    const unauth = await fetch(`${base}/ops/content-changes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, agentId, instruction: '优化', grantId: grant.id }),
    });
    expect(unauth.status).toBe(401);

    // 2. 带 token 提交
    const created = await fetch(`${base}/ops/content-changes`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        slug,
        agentId,
        instruction: '通过 HTTP 创建候选',
        grantId: grant.id,
        requestKey: 'http-propose-01',
      }),
    });
    expect(created.status).toBe(201);
    const change = await created.json() as { id: string; state: string; target: { slug: string } };
    expect(change.state).toBe('PROPOSED');
    expect(change.target.slug).toBe(slug);

    // 3. GET 列表查询
    const listRes = await fetch(`${base}/ops/content-changes?slug=${slug}`, { headers: authHeaders });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json() as { items: Array<{ id: string }> };
    expect(listData.items.some((item) => item.id === change.id)).toBe(true);

    // 4. GET 详情查询
    const detailRes = await fetch(`${base}/ops/content-changes/${change.id}`, { headers: authHeaders });
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json() as { id: string; candidateRef: string };
    expect(detail.id).toBe(change.id);
  });
});
