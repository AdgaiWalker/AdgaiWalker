import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { CONTENT_FILE_REPOSITORY, type ContentFileRepositoryPort } from '../ports/content-file.repository';
import { WORK_REPOSITORY, type WorkRepositoryPort } from '../ports/work.repository';
import { STAGE_ARTIFACT_REPOSITORY, type StageArtifactRepositoryPort } from '../ports/stage-artifact.repository';
import { PublicationService } from '../workflow/publication.service';
import { GIT_STATUS } from '../ports/git-status.repository';
import { CONTENT_RELEASE_RUNNER } from '../ports/content-release-runner.port';

const token = 'c11-bypass-token';
const authHeaders = { 'x-admin-token': token, 'content-type': 'application/json' };
const publicHeaders = { 'content-type': 'application/json' };

let app: INestApplication;
let base: string;
let contentDir: string;
let moduleRef: TestingModule;

describe('C11 清点并封闭内容写入旁路 (A07 & A08 安全红线)', () => {
  beforeAll(async () => {
    contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c11-content-'));
    vi.stubEnv('WALKER_ADMIN_TOKEN', token);
    vi.stubEnv('CONTENT_LOG_DIR', contentDir);
    vi.stubEnv('AI_ENABLED', 'false');

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GIT_STATUS)
      .useValue({
        async snapshot() { return { available: true, dirtyFiles: [], headCommit: 'head' }; },
        async workspaceSnapshot() { return { available: true, headCommit: 'head', files: [], dirtyFiles: [] }; },
        async hasCommit() { return true; },
      })
      .overrideProvider(CONTENT_RELEASE_RUNNER)
      .useValue({
        async runRelease() { return { exitCode: 0, timedOut: false, exitProof: 'exited', stdout: 'SUCCESS', stderr: '' }; },
      })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    const db = app?.get<PrismaPort>(PRISMA).getClient();
    if (db) {
      await db.contentChange.deleteMany({ where: { targetSlug: { startsWith: 'c11-' } } });
      await db.auditRecord.deleteMany({ where: { targetId: { startsWith: 'c11-' } } });
      await db.publication.deleteMany({});
      await db.publication.deleteMany({});
      await db.submission.deleteMany({ where: { id: { startsWith: 'c11-' } } });
      await db.seedClueLink.deleteMany({ where: { id: { startsWith: 'link-c11-' } } });
      await db.execution.deleteMany({ where: { id: { startsWith: 'execution-c11-' } } });
      await db.seed.deleteMany({ where: { id: { startsWith: 'seed-c11-' } } });
      await db.clue.deleteMany({ where: { id: { startsWith: 'clue-c11-' } } });
    }
    await app?.close();
    if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('旧工作站发布流程 (PublicationService) 已收敛至受控 mutation 出口，经由 CAS 并写入完整意图/完成审计', async () => {
    const workId = 'c11-work-01';
    const slug = 'c11-post-pub-01';
    const initialRaw = '---\ntitle: 旧发布文章\ntype: post\n---\n# 原始文本\n';
    const filePath = path.join(contentDir, `${slug}.md`);
    await fs.writeFile(filePath, initialRaw, 'utf8');

    const works = app.get<WorkRepositoryPort>(WORK_REPOSITORY);
    await works.createFromDraft({
      id: workId,
      idempotencyKey: 'c11-key-01',
      title: '旧发布文章',
      manifestPath: 'manifest.json',
      coreViewpoint: '观点',
      protectedClaims: [],
      sourceProblem: '旧线索问题',
      whyNow: '现在解决',
      contentBrief: {
        audience: '读者',
        scenario: '场景',
        problem: '问题',
        keyQuestion: '问题',
        intendedAction: '行动',
      },
    });

    const now = new Date();
    const db = app.get<PrismaPort>(PRISMA).getClient()!;
    await db.submission.update({
      where: { id: workId },
      data: {
        status: 'APPROVED',
        approvedArtifactHash: 'artifact-hash-c11',
      },
    });

    const stages = app.get<StageArtifactRepositoryPort>(STAGE_ARTIFACT_REPOSITORY);
    await stages.write(workId, {
      recipeVersion: 1,
      stage: 'REVIEW_READY',
      output: {
        title: '旧发布文章',
        markdown: '# 这是经由工作站发布的新正文内容\n详细论述段落\n',
        summary: '文章摘要',
        form: 'article',
        domain: 'engineering',
        intent: 'guide',
        valueMode: 'actionable',
        aiUsePolicy: { readable: true, citable: true, actionable: true },
      },
      createdAt: now.toISOString(),
    });

    // 伪造正确的 approvedArtifactHash
    const latestStage = await stages.latest(workId, 'REVIEW_READY');
    await db.submission.update({
      where: { id: workId },
      data: { approvedArtifactHash: latestStage!.hash },
    });

    // 调用 PublicationService
    const pubService = app.get(PublicationService);
    const pubResult = await pubService.publishWebsite(workId, latestStage!.hash);

    expect(pubResult.status).toBe('PREPARED');

    // 验证：受控 mutation 写入了完整的审计记录
    const audits = await db.auditRecord.findMany({
      where: { targetType: 'content' },
      orderBy: { createdAt: 'asc' },
    });
    const saveAudits = audits.filter((a) => a.action.startsWith('content.manual-save'));
    expect(saveAudits.length).toBeGreaterThanOrEqual(2);
    expect(saveAudits.some((a) => a.action === 'content.manual-save.intent')).toBe(true);
    expect(saveAudits.some((a) => a.action === 'content.manual-save.completed')).toBe(true);

    // 验证：正本文件成功通过 CAS 更新
    const files = app.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
    const updatedDoc = await files.get(pubResult.url ? pubResult.url.split('/posts/')[1]! : slug);
    expect(updatedDoc).not.toBeNull();
    expect(updatedDoc?.raw).toContain('这是经由工作站发布的新正文内容');
  });

  it('公开来源或匿名攻击绝对无法修改正本、元数据或项目状态 (A07 & A08)', async () => {
    const slug = 'c11-secure-post';
    const filePath = path.join(contentDir, `${slug}.md`);
    const initialRaw = '---\ntitle: 安全正本\ntype: post\n---\n任何公开攻击均不可修改我\n';
    await fs.writeFile(filePath, initialRaw, 'utf8');

    // 1. 尝试直接 PUT 正本
    const putRes = await fetch(`${base}/admin/content/${slug}`, {
      method: 'PUT',
      headers: publicHeaders,
      body: JSON.stringify({ raw: '恶意修改', expectedHash: null, actor: 'owner' }),
    });
    expect(putRes.status).toBe(401);

    // 2. 尝试伪造管理员提交候选提议
    const proposeRes = await fetch(`${base}/ops/content-changes`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({ slug, agentId: 'any', instruction: '恶意提议', grantId: 'hacked' }),
    });
    expect(proposeRes.status).toBe(401);

    // 3. 尝试伪造审批
    const approveRes = await fetch(`${base}/ops/content-changes/fake-id/approve`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({ grantId: 'hacked' }),
    });
    expect(approveRes.status).toBe(401);

    // 4. 尝试伪造候选应用
    const applyRes = await fetch(`${base}/ops/content-changes/fake-id/apply`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({ requestId: 'hacked' }),
    });
    expect(applyRes.status).toBe(401);

    // 5. 尝试伪造工作站发布
    const workPubRes = await fetch(`${base}/works/fake-work/publish/website`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({ artifactHash: 'hacked' }),
    });
    expect(workPubRes.status).toBe(401);

    // 6. 尝试修改 Action/Seed 项目状态
    const actionRes = await fetch(`${base}/actions`, {
      method: 'POST',
      headers: publicHeaders,
      body: JSON.stringify({ title: '恶意事项' }),
    });
    expect(actionRes.status).toBe(401);

    // 核心断言：正本文件内容绝未被修改
    const diskContent = await fs.readFile(filePath, 'utf8');
    expect(diskContent).toBe(initialRaw);
  });

  it('即使用户具备管理员权限，陈旧的 expectedHash 也必须被 CAS 拒绝并保留原文', async () => {
    const slug = 'c11-cas-protect';
    const filePath = path.join(contentDir, `${slug}.md`);
    const initialRaw = '---\ntitle: CAS保护文章\ntype: post\n---\n原文稳定\n';
    await fs.writeFile(filePath, initialRaw, 'utf8');

    // 传入完全错误的 expectedHash
    const conflictRes = await fetch(`${base}/admin/content/${slug}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        raw: '---\ntitle: 篡改文章\ntype: post\n---\n篡改内容\n',
        expectedHash: 'f'.repeat(64),
      }),
    });
    expect(conflictRes.status).toBe(409);

    // 正本保持未被修改
    const diskContent = await fs.readFile(filePath, 'utf8');
    expect(diskContent).toBe(initialRaw);
  });
});
