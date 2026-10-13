import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { CONTENT_FILE_REPOSITORY, type ContentFileRepositoryPort } from '../ports/content-file.repository';
import { CONTENT_CHANGE_REPOSITORY, type ContentChangeRepositoryPort } from '../ports/content-change.repository';
import { CONTENT_MUTATION_SERVICE, type ContentMutationPort } from '../ports/content-mutation.port';
import { CANDIDATE_FILE_REPOSITORY, type CandidateFileRepositoryPort } from '../ports/candidate-file.repository';
import { AUTHORIZATION_REPOSITORY, type AuthorizationRepositoryPort } from '../ports/authorization.repository';

const token = 'approval-test-token';
const authHeaders = { 'x-admin-token': token, 'content-type': 'application/json' };
const agentId = 'c09-approval-agent';

let app: INestApplication;
let base: string;
let contentDir: string;
let candidateDir: string;
let moduleRef: TestingModule;

describe('C09 精确审批与一次性消费', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c09-content-'));
    candidateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c09-candidates-'));
    vi.stubEnv('WALKER_ADMIN_TOKEN', token);
    vi.stubEnv('CONTENT_LOG_DIR', contentDir);
    vi.stubEnv('WALKER_CANDIDATES_DIR', candidateDir);
    vi.stubEnv('AI_ENABLED', 'false');

    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();

    const db = app.get<PrismaPort>(PRISMA).getClient()!;
    await db.agentUnit.create({ data: { id: agentId, name: '审批测试 Agent', prompt: '只读' } });
    await db.agentRevision.create({
      data: {
        id: 'rev-c09',
        agentId,
        version: 1,
        prompt: '只读',
        modelId: 'deepseek-chat',
        toolProfile: { id: 'read-only', version: 1 },
        schemaVersion: 1,
        configHash: 'c'.repeat(64),
      },
    });
  });

  afterAll(async () => {
    const db = app?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.contentChange.deleteMany({ where: { targetSlug: { startsWith: 'c09-' } } });
      await db.auditRecord.deleteMany({ where: { targetId: { startsWith: 'c09-' } } });
      await db.authorizationGrant.deleteMany({ where: { agentId } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    if (candidateDir) await fs.rm(candidateDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  async function createFixture(name: string) {
    const slug = `c09-${name}`;
    const filePath = path.join(contentDir, `${slug}.md`);
    const initialRaw = `---\ntitle: ${name}\ntype: post\n---\n# 原始正文\n`;
    const candidateRaw = `---\ntitle: ${name}\ntype: post\n---\n# 候选正文内容更新\n`;
    await fs.writeFile(filePath, initialRaw, 'utf8');

    const files = app.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
    const initialDoc = (await files.get(slug))!;

    const candidateFiles = app.get<CandidateFileRepositoryPort>(CANDIDATE_FILE_REPOSITORY);
    const candRecord = await candidateFiles.save(`cand-${name}`, candidateRaw);

    const changes = app.get<ContentChangeRepositoryPort>(CONTENT_CHANGE_REPOSITORY);
    const change = await changes.createOnce({
      id: `change-${name}`,
      target: { kind: 'content', slug },
      baseHash: initialDoc.hash,
      candidateHash: candRecord.hash,
      candidateRef: candRecord.candidateRef,
      sourceRunId: null,
      requestKey: `req-${name}`,
    });

    // 创建具有 content:approve 和 content:apply 权限的 L2 授权
    const grantRes = await fetch(`${base}/ops/grants`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        requestKey: `grant-req-${name}`,
        level: 'L2',
        agentId,
        actions: ['content:read', 'agent:run', 'content:propose', 'content:approve', 'content:apply'],
        resourceScope: { kind: 'content', ids: [slug] },
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        runLimit: 1,
        usageLimit: 10_000,
      }),
    });
    expect(grantRes.status).toBe(201);
    const grant = (await grantRes.json()) as { id: string };

    return { slug, filePath, initialRaw, candidateRaw, change, grantId: grant.id, initialHash: initialDoc.hash };
  }

  it('批准候选绑定动作、正文版本与授权修订，重复批准幂等', async () => {
    const { slug, change, grantId } = await createFixture('approve-idempotent');
    const mutation = app.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);

    // 1. 首次批准
    const approved = await mutation.approve({
      changeId: change.id,
      grantId,
      actor: 'owner',
    });
    expect(approved.state).toBe('APPROVED');
    expect(approved.applyApproval).not.toBeNull();
    expect(approved.applyApproval?.binding.grantId).toBe(grantId);
    expect(approved.applyApproval?.binding.baseHash).toBe(change.baseHash);
    expect(approved.applyApproval?.binding.candidateHash).toBe(change.candidateHash);

    // 2. 相同授权重复批准：幂等返回已批准事实
    const secondApproved = await mutation.approve({
      changeId: change.id,
      grantId,
      actor: 'owner',
    });
    expect(secondApproved.state).toBe('APPROVED');
    expect(secondApproved.applyApproval?.id).toBe(approved.applyApproval?.id);
  });

  it('正本内容发生变更与基线冲突时，拒绝批准', async () => {
    const { slug, filePath, change, grantId } = await createFixture('approve-conflict');
    const mutation = app.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);

    // 在批准前外部修改正本
    await fs.writeFile(filePath, '---\ntitle: 外部修改\ntype: post\n---\n外部修改导致冲突\n', 'utf8');

    await expect(
      mutation.approve({
        changeId: change.id,
        grantId,
        actor: 'owner',
      }),
    ).rejects.toThrowError(/conflict|冲突|409/i);
  });

  it('执行应用前复检并原子消费审批，重复执行幂等且不重复写文件，修改授权不含发布', async () => {
    const { slug, filePath, change, grantId, candidateRaw } = await createFixture('apply-consume');
    const mutation = app.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);

    // 1. 先批准
    await mutation.approve({ changeId: change.id, grantId, actor: 'owner' });

    // 2. 执行应用
    const applied = await mutation.apply({
      changeId: change.id,
      actor: 'owner',
      requestId: 'apply-req-001',
    });
    expect(applied.state).toBe('APPLIED');
    expect(applied.appliedHash).toBe(change.candidateHash);

    // 正本已落盘为候选正文
    const diskContent = await fs.readFile(filePath, 'utf8');
    expect(diskContent).toBe(candidateRaw);

    // 3. 重复执行应用：幂等返回已应用状态，不重复写正本
    const secondApply = await mutation.apply({
      changeId: change.id,
      actor: 'owner',
      requestId: 'apply-req-002',
    });
    expect(secondApply.state).toBe('APPLIED');
    expect(secondApply.appliedHash).toBe(change.candidateHash);

    // 4. 修改授权不自动含发布：检查并未生成 release
    const db = app.get<PrismaPort>(PRISMA).getClient()!;
    const releases = await db.contentRelease.findMany({ where: { changeId: change.id } });
    expect(releases.length).toBe(0);
  });

  it('审批后若授权被撤销，执行前复检发现授权失效并拒绝执行', async () => {
    const { change, grantId } = await createFixture('grant-revoked');
    const mutation = app.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);

    // 批准
    await mutation.approve({ changeId: change.id, grantId, actor: 'owner' });

    // 撤销授权
    const grants = app.get<AuthorizationRepositoryPort>(AUTHORIZATION_REPOSITORY);
    await grants.revoke(grantId, new Date());

    // 执行应用必须被拒绝
    await expect(
      mutation.apply({
        changeId: change.id,
        actor: 'owner',
        requestId: 'apply-req-revoked',
      }),
    ).rejects.toThrowError(/grant|撤销|失效|403/i);
  });

  it('HTTP /ops/content-changes/:id/approve 与 /apply 端点受管理鉴权保护并完成闭环', async () => {
    const { slug, change, grantId, candidateRaw, filePath } = await createFixture('http-approval');

    // 1. 匿名调用返回 401
    const anonApprove = await fetch(`${base}/ops/content-changes/${change.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grantId }),
    });
    expect(anonApprove.status).toBe(401);

    // 2. 管理鉴权调用 approve
    const authApprove = await fetch(`${base}/ops/content-changes/${change.id}/approve`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ grantId }),
    });
    expect(authApprove.status).toBe(200);
    const approvedChange = (await authApprove.json()) as { state: string };
    expect(approvedChange.state).toBe('APPROVED');

    // 3. 管理鉴权调用 apply
    const authApply = await fetch(`${base}/ops/content-changes/${change.id}/apply`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ requestId: 'http-apply-req-01' }),
    });
    expect(authApply.status).toBe(200);
    const appliedChange = (await authApply.json()) as { state: string };
    expect(appliedChange.state).toBe('APPLIED');

    // 文件已正确落盘
    expect(await fs.readFile(filePath, 'utf8')).toBe(candidateRaw);
  });
});
