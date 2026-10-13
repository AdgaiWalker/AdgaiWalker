import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { contentApprovalBindingKey, type ContentApproval, type ContentChange, type ContentTarget } from '@walker/shared';
import { ConfigModule } from './config/config.module';
import { AppModule } from './app.module';
import { KernelModule } from './kernel.module';
import { CONTENT_CHANGE_REPOSITORY, type ContentChangeRepositoryPort } from './ports/content-change.repository';
import { CONTENT_FILE_REPOSITORY, type ContentFileRepositoryPort } from './ports/content-file.repository';
import { CONTENT_MUTATION_SERVICE, type ContentMutationInput, type ContentMutationPort } from './ports/content-mutation.port';
import { CANDIDATE_FILE_REPOSITORY, type CandidateFileRepositoryPort } from './ports/candidate-file.repository';
import { OPERATIONS_JOURNAL, type OperationsJournalPort } from './ports/operations-journal.port';
import { PRISMA, type PrismaPort } from './ports/prisma.port';

const prefix = `c04-${randomUUID().replaceAll('-', '')}`;
let kernel: TestingModule;
let contentDir: string;

async function createKernel() {
  return Test.createTestingModule({ imports: [ConfigModule, KernelModule] }).compile();
}

async function restartKernel() {
  await kernel.close();
  kernel = await createKernel();
}

function proposal() {
  return {
    id: `${prefix}-change`,
    target: { kind: 'content' as const, slug: 'c04-article' },
    baseHash: 'a'.repeat(64),
    candidateHash: 'b'.repeat(64),
    candidateRef: `${prefix}-candidate`,
    sourceRunId: null,
    requestKey: `${prefix}-request`,
  };
}

function applyApproval(change: { target: ContentTarget; baseHash: string; candidateHash: string }): ContentApproval<'apply-candidate'> {
  const binding = {
    action: 'apply-candidate' as const,
    target: change.target,
    baseHash: change.baseHash,
    candidateHash: change.candidateHash,
    grantId: `${prefix}-grant`,
    grantRevision: 2,
  };
  return {
    id: `${prefix}-approval`,
    binding,
    bindingHash: createHash('sha256').update(contentApprovalBindingKey(binding)).digest('hex'),
    approvedBy: 'owner',
    approvedAt: '2026-09-25T08:00:00.000Z',
  };
}

beforeAll(async () => {
  kernel = await createKernel();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (contentDir) await fs.rm(contentDir, { recursive: true, force: true });
  contentDir = '';
});

afterAll(async () => {
  await kernel?.close();
});

async function mutationFixture(name: string): Promise<{ input: ContentMutationInput; file: string; candidateRaw: string }> {
  contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c04-content-'));
  vi.stubEnv('CONTENT_LOG_DIR', contentDir);
  const slug = `${prefix}-${name}`;
  const file = path.join(contentDir, `${slug}.md`);
  const baseRaw = `---\ntitle: ${name}\ntype: knowledge\n---\n\n旧正文\n`;
  const candidateRaw = `---\ntitle: ${name}\ntype: knowledge\n---\n\n批准后的正文\n`;
  await fs.writeFile(file, baseRaw, 'utf8');
  const files = kernel.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
  const current = await files.get(slug);
  if (!current) throw new Error('fixture 内容文件未建立');
  const change = {
    id: `${prefix}-${name}-change`,
    target: { kind: 'content' as const, slug },
    baseHash: current.hash,
    candidateHash: createHash('sha256').update(candidateRaw).digest('hex'),
    candidateRef: `${prefix}-${name}-candidate`,
    sourceRunId: null,
    requestKey: `${prefix}-${name}-request`,
  };
  const db = kernel.get<PrismaPort>(PRISMA).getClient()!;
  await db.authorizationGrant.upsert({
    where: { id: `${prefix}-grant` },
    create: {
      id: `${prefix}-grant`,
      principalType: 'owner',
      principalId: 'owner',
      agentId: null,
      origin: 'admin',
      actions: JSON.stringify(['content:read', 'agent:run', 'content:propose', 'content:approve', 'content:apply']),
      resourceScope: JSON.stringify({ kind: 'content', ids: [slug] }),
      expiresAt: new Date(Date.now() + 3600_000),
      runLimit: 100,
      usageLimit: 10_000,
      revision: 2,
      revokedAt: null,
    },
    update: {
      resourceScope: JSON.stringify({ kind: 'content', ids: [slug] }),
    },
  });

  const changes = kernel.get<ContentChangeRepositoryPort>(CONTENT_CHANGE_REPOSITORY);
  await changes.createOnce(change);
  await changes.recordApproval({ id: change.id, approval: applyApproval(change) });
  return {
    input: { changeId: change.id, candidateRaw, actor: 'owner', requestId: `${prefix}-${name}-apply` },
    file,
    candidateRaw,
  };
}

it('Kernel 注册候选 apply/reconcile 服务', () => {
  expect(() => kernel.get(CONTENT_MUTATION_SERVICE)).not.toThrow();
});

it('开始文件应用时原子写入 APPLYING 意图与 before/after hash 审计，重试不重复记账', async () => {
  const repository = kernel.get(CONTENT_CHANGE_REPOSITORY) as ContentChangeRepositoryPort & {
    beginApply(input: { id: string; actor: string; requestId: string }): Promise<ContentChange>;
  };
  const change = proposal();
  await repository.createOnce(change);
  await repository.recordApproval({ id: change.id, approval: applyApproval(change) });

  const started = await repository.beginApply({ id: change.id, actor: 'owner', requestId: `${prefix}-apply` });
  const retried = await repository.beginApply({ id: change.id, actor: 'owner', requestId: `${prefix}-apply` });
  const audits = await kernel.get<PrismaPort>(PRISMA).getClient()!.auditRecord.findMany({
    where: { targetType: 'content-change', targetId: change.id },
    orderBy: { createdAt: 'asc' },
  });

  expect(started.state).toBe('APPLYING');
  expect(retried).toEqual(started);
  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({
    actor: 'owner',
    action: 'content.apply.intent',
    beforeHash: change.baseHash,
    afterHash: change.candidateHash,
    outcome: 'applying',
    requestId: `${prefix}-apply`,
  });
});

it('审计写入失败时事务回滚，不留下没有审计的 APPLYING 状态', async () => {
  const repository = kernel.get(CONTENT_CHANGE_REPOSITORY) as ContentChangeRepositoryPort & {
    beginApply(input: { id: string; actor: string; requestId: string }): Promise<ContentChange>;
  };
  const change = { ...proposal(), id: `${prefix}-audit-rollback`, requestKey: `${prefix}-audit-rollback-request` };
  await repository.createOnce(change);
  await repository.recordApproval({ id: change.id, approval: applyApproval(change) });
  const db = kernel.get<PrismaPort>(PRISMA).getClient()!;
  await db.$executeRawUnsafe(`CREATE TRIGGER "c04_abort_audit_before_insert" BEFORE INSERT ON "AuditRecord" BEGIN SELECT RAISE(ABORT, 'simulated-audit-failure'); END`);

  try {
    await expect(repository.beginApply({ id: change.id, actor: 'owner', requestId: `${prefix}-audit-rollback-apply` }))
      .rejects.toThrow();
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "c04_abort_audit_before_insert"');
  }

  expect((await repository.findById(change.id))?.state).toBe('APPROVED');
  expect(await db.auditRecord.count({ where: { targetType: 'content-change', targetId: change.id } })).toBe(0);
});

it('文件 hash 确认后原子记为 APPLIED，并且完成重放不重复写审计', async () => {
  const repository = kernel.get(CONTENT_CHANGE_REPOSITORY) as ContentChangeRepositoryPort & {
    finishApply(input: {
      id: string;
      actor: string;
      requestId: string;
      outcome: 'APPLIED' | 'CONFLICT' | 'UNKNOWN';
      observedHash: string | null;
    }): Promise<ContentChange>;
  };
  const change = { ...proposal(), id: `${prefix}-finish-change`, requestKey: `${prefix}-finish-request` };
  await repository.createOnce(change);
  await repository.recordApproval({ id: change.id, approval: applyApproval(change) });
  await repository.beginApply({ id: change.id, actor: 'owner', requestId: `${prefix}-finish-apply` });

  const applied = await repository.finishApply({
    id: change.id,
    actor: 'owner',
    requestId: `${prefix}-finish-apply`,
    outcome: 'APPLIED',
    observedHash: change.candidateHash,
  });
  const replayed = await repository.finishApply({
    id: change.id,
    actor: 'owner',
    requestId: `${prefix}-finish-apply`,
    outcome: 'APPLIED',
    observedHash: change.candidateHash,
  });
  const audits = await kernel.get<PrismaPort>(PRISMA).getClient()!.auditRecord.findMany({
    where: { targetType: 'content-change', targetId: change.id },
    orderBy: { createdAt: 'asc' },
  });

  expect(applied).toMatchObject({ state: 'APPLIED', appliedHash: change.candidateHash });
  expect(replayed).toEqual(applied);
  expect(audits).toHaveLength(2);
  expect(audits[1]).toMatchObject({
    action: 'content.apply.applied',
    beforeHash: change.baseHash,
    afterHash: change.candidateHash,
    outcome: 'applied',
  });
});

it('应用候选后文件和 DB 分别记录真实结果，不把文件写入伪装成跨资源事务', async () => {
  const fixture = await mutationFixture('successful-apply');
  const mutation = kernel.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);

  const result = await mutation.apply(fixture.input);
  const audits = await kernel.get<PrismaPort>(PRISMA).getClient()!.auditRecord.findMany({
    where: { targetType: 'content-change', targetId: fixture.input.changeId },
    orderBy: { createdAt: 'asc' },
  });

  expect(result).toMatchObject({ state: 'APPLIED', appliedHash: createHash('sha256').update(fixture.candidateRaw).digest('hex') });
  expect(await fs.readFile(fixture.file, 'utf8')).toBe(fixture.candidateRaw);
  expect(audits.map((entry) => entry.action)).toEqual(['content.apply.intent', 'content.apply.applied']);
});

it('写入意图后进程中断，恢复会从仍为 baseHash 的文件继续 CAS 写入', async () => {
  const fixture = await mutationFixture('intent-crash');
  const mutation = kernel.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);
  const files = kernel.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
  const save = vi.spyOn(files, 'save').mockRejectedValueOnce(new Error('simulated-crash-after-intent'));

  await expect(mutation.apply(fixture.input)).rejects.toThrow('simulated-crash-after-intent');
  expect((await kernel.get<ContentChangeRepositoryPort>(CONTENT_CHANGE_REPOSITORY).findById(fixture.input.changeId))?.state).toBe('APPLYING');
  save.mockRestore();
  await restartKernel();

  const recovered = await kernel.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE).reconcile(fixture.input);
  expect(recovered.state).toBe('APPLIED');
  expect(await fs.readFile(fixture.file, 'utf8')).toBe(fixture.candidateRaw);
});

it('文件替换后 DB 回写前进程中断，恢复只补 DB 与审计，不重复写文件', async () => {
  const fixture = await mutationFixture('database-crash');
  const mutation = kernel.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);
  const files = kernel.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
  const changes = kernel.get(CONTENT_CHANGE_REPOSITORY) as ContentChangeRepositoryPort & {
    finishApply(input: { id: string; actor: string; requestId: string; outcome: 'APPLIED'; observedHash: string }): Promise<ContentChange>;
  };
  const finish = vi.spyOn(changes, 'finishApply').mockRejectedValueOnce(new Error('simulated-crash-before-db-commit'));

  await expect(mutation.apply(fixture.input)).rejects.toThrow('simulated-crash-before-db-commit');
  expect((await changes.findById(fixture.input.changeId))?.state).toBe('APPLYING');
  expect(await fs.readFile(fixture.file, 'utf8')).toBe(fixture.candidateRaw);
  finish.mockRestore();
  await restartKernel();

  const recoveredFiles = kernel.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
  const save = vi.spyOn(recoveredFiles, 'save');
  const recovered = await kernel.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE).reconcile(fixture.input);
  expect(recovered.state).toBe('APPLIED');
  expect(save).not.toHaveBeenCalled();
});

it('恢复发现文件 hash 与 base/candidate 均不符时记冲突且保留外部正文', async () => {
  const fixture = await mutationFixture('external-conflict');
  const mutation = kernel.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);
  const files = kernel.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
  await kernel.get<ContentChangeRepositoryPort>(CONTENT_CHANGE_REPOSITORY)
    .beginApply({ id: fixture.input.changeId, actor: 'owner', requestId: fixture.input.requestId });
  const externalRaw = '---\ntitle: 外部编辑\ntype: knowledge\n---\n\n不得覆盖\n';
  await fs.writeFile(fixture.file, externalRaw, 'utf8');
  const save = vi.spyOn(files, 'save');

  const recovered = await mutation.reconcile(fixture.input);

  expect(recovered).toMatchObject({ state: 'CONFLICT', appliedHash: null });
  expect(await fs.readFile(fixture.file, 'utf8')).toBe(externalRaw);
  expect(save).not.toHaveBeenCalled();
});

it('人工保存记录 intent/完成 hash 审计并通过同一 CAS 文件出口', async () => {
  contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c05-manual-'));
  vi.stubEnv('CONTENT_LOG_DIR', contentDir);
  const slug = `${prefix}-manual-save`;
  const file = path.join(contentDir, `${slug}.md`);
  const original = '---\ntitle: 人工保存\ntype: knowledge\n---\n\n旧正文\n';
  const updated = '---\ntitle: 人工保存\ntype: knowledge\n---\n\n新正文\n';
  await fs.writeFile(file, original, 'utf8');
  const files = kernel.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
  const current = await files.get(slug);
  if (!current) throw new Error('fixture 内容文件未建立');
  const mutation = kernel.get(CONTENT_MUTATION_SERVICE) as ContentMutationPort & {
    saveManual(input: { slug: string; raw: string; expectedHash: string; actor: string; requestId: string }): Promise<{ hash: string; raw: string }>;
  };

  const saved = await mutation.saveManual({
    slug,
    raw: updated,
    expectedHash: current.hash,
    actor: 'owner',
    requestId: `${prefix}-manual-save-request`,
  });
  const audits = await kernel.get<PrismaPort>(PRISMA).getClient()!.auditRecord.findMany({
    where: { targetType: 'content', targetId: slug },
    orderBy: { createdAt: 'asc' },
  });

  expect(saved.raw).toBe(updated);
  expect(await fs.readFile(file, 'utf8')).toBe(updated);
  expect(audits.map((entry) => entry.action)).toEqual(['content.manual-save.intent', 'content.manual-save.completed']);
  expect(audits[0]).toMatchObject({ beforeHash: current.hash, afterHash: saved.hash, outcome: 'saving' });
  expect(audits[1]).toMatchObject({ beforeHash: current.hash, afterHash: saved.hash, outcome: 'saved' });
});

it('intent 审计不可用时拒绝人工写入，正文保持不变', async () => {
  contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c05-audit-gate-'));
  vi.stubEnv('CONTENT_LOG_DIR', contentDir);
  const slug = `${prefix}-audit-gate`;
  const file = path.join(contentDir, `${slug}.md`);
  const original = '---\ntitle: 审计门\ntype: knowledge\n---\n\n原文\n';
  await fs.writeFile(file, original, 'utf8');
  const files = kernel.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
  const current = await files.get(slug);
  if (!current) throw new Error('fixture 内容文件未建立');
  const journal = kernel.get<OperationsJournalPort>(OPERATIONS_JOURNAL);
  vi.spyOn(journal, 'transaction').mockRejectedValueOnce(new Error('simulated-db-outage'));
  const mutation = kernel.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);

  await expect(mutation.saveManual({
    slug,
    raw: `${original}新正文\n`,
    expectedHash: current.hash,
    actor: 'owner',
    requestId: `${prefix}-audit-gate-request`,
  })).rejects.toMatchObject({ response: { code: 'content-audit-unavailable' } });
  expect(await fs.readFile(file, 'utf8')).toBe(original);
});

it('完成审计不可用时如实提示正文已写入，intent 审计仍保留', async () => {
  contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c05-audit-result-'));
  vi.stubEnv('CONTENT_LOG_DIR', contentDir);
  const slug = `${prefix}-audit-result`;
  const file = path.join(contentDir, `${slug}.md`);
  const original = '---\ntitle: 结果审计\ntype: knowledge\n---\n\n旧正文\n';
  const updated = '---\ntitle: 结果审计\ntype: knowledge\n---\n\n新正文\n';
  await fs.writeFile(file, original, 'utf8');
  const files = kernel.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
  const current = await files.get(slug);
  if (!current) throw new Error('fixture 内容文件未建立');
  const journal = kernel.get<OperationsJournalPort>(OPERATIONS_JOURNAL);
  const transaction = journal.transaction.bind(journal);
  vi.spyOn(journal, 'transaction')
    .mockImplementationOnce((work) => transaction(work))
    .mockRejectedValueOnce(new Error('simulated-result-audit-outage'));
  const mutation = kernel.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);

  await expect(mutation.saveManual({
    slug,
    raw: updated,
    expectedHash: current.hash,
    actor: 'owner',
    requestId: `${prefix}-audit-result-request`,
  })).rejects.toMatchObject({ response: { code: 'content-save-audit-unavailable' } });
  expect(await fs.readFile(file, 'utf8')).toBe(updated);
  const audits = await kernel.get<PrismaPort>(PRISMA).getClient()!.auditRecord.findMany({
    where: { targetType: 'content', targetId: slug },
  });
  expect(audits.map((entry) => entry.action)).toEqual(['content.manual-save.intent']);
});

it('人工保存路由要求管理鉴权，CAS 写入记审计且不改公共内容快照', async () => {
  contentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-c05-http-'));
  const token = `${prefix}-admin-token`;
  const slug = `${prefix}-http-save`;
  const file = path.join(contentDir, `${slug}.md`);
  const original = '---\ntitle: HTTP 保存\ntype: knowledge\n---\n\n旧正文\n';
  const updated = '---\ntitle: HTTP 保存\ntype: knowledge\n---\n\n新正文\n';
  const repoRoot = path.resolve(__dirname, '../../..');
  const publicSnapshotPath = path.join(repoRoot, 'apps/web/src/generated/content.json');
  const publicSnapshotBefore = await fs.readFile(publicSnapshotPath);
  await fs.writeFile(file, original, 'utf8');
  vi.stubEnv('CONTENT_LOG_DIR', contentDir);
  vi.stubEnv('WALKER_ADMIN_TOKEN', token);
  vi.stubEnv('CONTENT_GEN_ON_SAVE', 'true');

  let app: INestApplication | undefined;
  try {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const publicRequestHeaders = { 'content-type': 'application/json' };
    const authHeaders = { ...publicRequestHeaders, 'x-admin-token': token };

    const denied = await fetch(`${base}/admin/content/${slug}`, {
      method: 'PUT', headers: publicRequestHeaders, body: JSON.stringify({ raw: updated, expectedHash: null }),
    });
    expect(denied.status).toBe(401);
    const db = app.get<PrismaPort>(PRISMA).getClient()!;
    expect(await db.auditRecord.count({ where: { targetType: 'content', targetId: slug } })).toBe(0);

    const detailResponse = await fetch(`${base}/admin/content/${slug}`, { headers: authHeaders });
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json() as { hash: string };
    const stale = await fetch(`${base}/admin/content/${slug}`, {
      method: 'PUT', headers: authHeaders, body: JSON.stringify({ raw: updated, expectedHash: 'f'.repeat(64) }),
    });
    expect(stale.status).toBe(409);
    expect(await fs.readFile(file, 'utf8')).toBe(original);

    const saved = await fetch(`${base}/admin/content/${slug}`, {
      method: 'PUT', headers: authHeaders, body: JSON.stringify({ raw: updated, expectedHash: detail.hash }),
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ raw: updated, hash: createHash('sha256').update(updated).digest('hex') });
    expect(await fs.readFile(file, 'utf8')).toBe(updated);
    expect(await fs.readFile(publicSnapshotPath)).toEqual(publicSnapshotBefore);
    expect((await db.auditRecord.findMany({ where: { targetType: 'content', targetId: slug }, orderBy: { createdAt: 'asc' } }))
      .map((entry) => entry.action)).toEqual([
        'content.manual-save.intent', 'content.manual-save.conflict',
        'content.manual-save.intent', 'content.manual-save.completed',
      ]);
    expect(await db.contentChange.count({ where: { targetSlug: slug } })).toBe(0);
  } finally {
    await app?.close();
  }
});

it('C07: 允许通过 candidateRef 从独立候选文件仓储读取候选并应用', async () => {
  const candidateFiles = kernel.get<CandidateFileRepositoryPort>(CANDIDATE_FILE_REPOSITORY);
  expect(candidateFiles).toBeDefined();

  const fixture = await mutationFixture('auto-read-cand');
  const candidateRaw = fixture.candidateRaw;
  const candRecord = await candidateFiles.save(`${prefix}-cand-auto`, candidateRaw);

  const changes = kernel.get<ContentChangeRepositoryPort>(CONTENT_CHANGE_REPOSITORY);
  const files = kernel.get<ContentFileRepositoryPort>(CONTENT_FILE_REPOSITORY);
  const current = await files.get(`${prefix}-auto-read-cand`);
  expect(current).not.toBeNull();

  const change = {
    id: `${prefix}-cand-change-01`,
    target: { kind: 'content' as const, slug: `${prefix}-auto-read-cand` },
    baseHash: current!.hash,
    candidateHash: candRecord.hash,
    candidateRef: candRecord.candidateRef,
    sourceRunId: null,
    requestKey: `${prefix}-cand-req-01`,
  };
  await changes.createOnce(change);
  await changes.recordApproval({ id: change.id, approval: applyApproval(change) });

  const mutation = kernel.get<ContentMutationPort>(CONTENT_MUTATION_SERVICE);
  // 不传入 candidateRaw，验证从 candidateFiles 读取并核验应用
  const applied = await mutation.apply({
    changeId: change.id,
    actor: 'owner',
    requestId: `${prefix}-cand-req-01`,
  });

  expect(applied.state).toBe('APPLIED');
  expect(applied.appliedHash).toBe(candRecord.hash);
  const onDisk = await fs.readFile(fixture.file, 'utf8');
  expect(onDisk).toBe(candidateRaw);

  // 若候选文件不存在，未传 candidateRaw 时拒绝
  const missingCandChange = {
    ...change,
    id: `${prefix}-missing-cand-change`,
    candidateRef: `${prefix}-nonexistent_cand`,
    requestKey: `${prefix}-missing-req`,
  };
  await changes.createOnce(missingCandChange);
  await changes.recordApproval({ id: missingCandChange.id, approval: applyApproval(missingCandChange) });

  await expect(mutation.apply({
    changeId: missingCandChange.id,
    actor: 'owner',
    requestId: `${prefix}-missing-req`,
  })).rejects.toThrowError(/找不到候选正文文件/);
});
