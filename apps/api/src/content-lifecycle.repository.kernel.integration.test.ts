import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, expect, it } from 'vitest';
import { contentApprovalBindingKey, type ContentApproval, type ContentApprovalAction, type ContentChange, type ContentRelease, type ContentTarget } from '@walker/shared';
import type { ContentChangeRepositoryPort } from './ports/content-change.repository';
import { CONTENT_CHANGE_REPOSITORY } from './ports/content-change.repository';
import { ConfigModule } from './config/config.module';
import { KernelModule } from './kernel.module';
import { PRISMA, type PrismaPort } from './ports/prisma.port';
import type { ContentReleaseRepositoryPort } from './ports/content-release.repository';
import { CONTENT_RELEASE_REPOSITORY } from './ports/content-release.repository';

const prefix = `c02-${randomUUID().replaceAll('-', '')}`;

async function createKernel() {
  return Test.createTestingModule({ imports: [ConfigModule, KernelModule] }).compile();
}

function proposal(overrides: Partial<Parameters<ContentChangeRepositoryPort['createOnce']>[0]> = {}) {
  return {
    id: `${prefix}-change`,
    target: { kind: 'content' as const, slug: 'c02-article' },
    baseHash: 'a'.repeat(64),
    candidateHash: 'b'.repeat(64),
    candidateRef: `${prefix}-candidate`,
    sourceRunId: null,
    requestKey: `${prefix}-proposal`,
    ...overrides,
  };
}

function makeApproval<Action extends ContentApprovalAction>(input: {
  action: Action;
  target: ContentTarget;
  baseHash: string;
  candidateHash: string;
  id: string;
  grantId: string;
  grantRevision: number;
}): ContentApproval<Action> {
  const binding = {
    action: input.action,
    target: input.target,
    baseHash: input.baseHash,
    candidateHash: input.candidateHash,
    grantId: input.grantId,
    grantRevision: input.grantRevision,
  };
  return {
    id: input.id,
    binding,
    bindingHash: createHash('sha256').update(contentApprovalBindingKey(binding)).digest('hex'),
    approvedBy: 'owner',
    approvedAt: '2026-09-25T07:00:00.000Z',
  };
}

let opened: TestingModule[] = [];

afterAll(async () => {
  await Promise.all(opened.map((module) => module.close()));
});

it('候选按请求键幂等创建，Kernel 重启后仍可读回同一条 SQLite 记录', async () => {
  const firstKernel = await createKernel();
  opened.push(firstKernel);
  const firstRepository = firstKernel.get<ContentChangeRepositoryPort>(CONTENT_CHANGE_REPOSITORY);
  const input = proposal();

  const created = await firstRepository.createOnce(input);
  const replayed = await firstRepository.createOnce({ ...input, id: `${prefix}-retry-id` });

  expect(replayed).toEqual(created);
  expect(created).toMatchObject({
    id: input.id,
    action: 'apply-candidate',
    target: input.target,
    baseHash: input.baseHash,
    candidateHash: input.candidateHash,
    candidateRef: input.candidateRef,
    sourceRunId: null,
    state: 'PROPOSED',
    applyApproval: null,
    appliedHash: null,
    requestKey: input.requestKey,
  });

  await firstKernel.close();
  opened = opened.filter((module) => module !== firstKernel);

  const restartedKernel = await createKernel();
  opened.push(restartedKernel);
  const restartedRepository = restartedKernel.get<ContentChangeRepositoryPort>(CONTENT_CHANGE_REPOSITORY);
  expect(await restartedRepository.findById(created.id)).toEqual(created);
  expect(await restartedRepository.findByRequestKey(input.requestKey)).toEqual(created);
  expect(await restartedKernel.get<PrismaPort>(PRISMA).getClient()?.contentChange.count({
    where: { requestKey: input.requestKey },
  })).toBe(1);
});

it('相同候选请求键不能被复用于另一份候选内容', async () => {
  const kernel = await createKernel();
  opened.push(kernel);
  const repository = kernel.get<ContentChangeRepositoryPort>(CONTENT_CHANGE_REPOSITORY);
  const input = proposal({ id: `${prefix}-conflict-change`, requestKey: `${prefix}-conflict-request` });
  const created = await repository.createOnce(input);

  await expect(repository.createOnce({
    ...input,
    id: `${prefix}-different-change`,
    candidateHash: 'd'.repeat(64),
    candidateRef: `${prefix}-other-candidate`,
  })).rejects.toMatchObject({ response: { code: 'idempotency-conflict' } });
  expect(await repository.findByRequestKey(input.requestKey)).toEqual(created);
  expect(await kernel.get<PrismaPort>(PRISMA).getClient()?.contentChange.count({
    where: { requestKey: input.requestKey },
  })).toBe(1);
});

it('候选批准只绑定一组精确版本与授权事实，并在重试时返回原批准', async () => {
  const kernel = await createKernel();
  opened.push(kernel);
  const repository = kernel.get(CONTENT_CHANGE_REPOSITORY) as ContentChangeRepositoryPort & {
    recordApproval(input: { id: string; approval: ContentApproval<'apply-candidate'> }): Promise<ContentChange>;
  };
  const input = proposal({ id: `${prefix}-approved-change`, requestKey: `${prefix}-approved-request` });
  await repository.createOnce(input);

  const approval = makeApproval({
    action: 'apply-candidate' as const,
    target: input.target,
    baseHash: input.baseHash,
    candidateHash: input.candidateHash,
    id: `${prefix}-approval`,
    grantId: `${prefix}-grant`,
    grantRevision: 3,
  });

  const approved = await repository.recordApproval({ id: input.id, approval });
  const replayed = await repository.recordApproval({ id: input.id, approval });

  expect(approved).toMatchObject({ id: input.id, state: 'APPROVED', applyApproval: approval });
  expect(replayed).toEqual(approved);

  const replacedApproval = makeApproval({
    action: 'apply-candidate',
    target: input.target,
    baseHash: input.baseHash,
    candidateHash: input.candidateHash,
    id: `${prefix}-replacement-approval`,
    grantId: `${prefix}-grant`,
    grantRevision: 4,
  });
  await expect(repository.recordApproval({ id: input.id, approval: replacedApproval }))
    .rejects.toMatchObject({ response: { code: 'content-approval-conflict' } });
  expect(await repository.findById(input.id)).toEqual(approved);

  await kernel.close();
  opened = opened.filter((module) => module !== kernel);
  const restartedKernel = await createKernel();
  opened.push(restartedKernel);
  const restartedRepository = restartedKernel.get<ContentChangeRepositoryPort>(CONTENT_CHANGE_REPOSITORY);
  expect((await restartedRepository.findById(input.id))?.applyApproval).toEqual(approval);
});

it('网页 release 只从已应用候选创建，并把网页核验与问答索引状态分开持久化', async () => {
  const kernel = await createKernel();
  opened.push(kernel);
  const changeRepository = kernel.get<ContentChangeRepositoryPort>(CONTENT_CHANGE_REPOSITORY);
  const change = proposal({ id: `${prefix}-release-change`, requestKey: `${prefix}-release-proposal` });
  await changeRepository.createOnce(change);
  const db = kernel.get<PrismaPort>(PRISMA).getClient()!;
  await db.contentChange.update({ where: { id: change.id }, data: { state: 'APPLIED', appliedHash: change.candidateHash } });

  const releaseRepository = kernel.get(CONTENT_RELEASE_REPOSITORY) as ContentReleaseRepositoryPort;
  const baseHash = 'c'.repeat(64);
  const publishApproval = makeApproval({
    action: 'publish-website' as const,
    target: change.target,
    baseHash,
    candidateHash: change.candidateHash,
    id: `${prefix}-publish-approval`,
    grantId: `${prefix}-publish-grant`,
    grantRevision: 4,
  });
  const input = {
    id: `${prefix}-release`,
    changeId: change.id,
    target: change.target,
    baseHash,
    sourceHash: change.candidateHash,
    publishApproval,
    requestKey: `${prefix}-release-request`,
  };

  const created = await releaseRepository.createOnce(input);
  const replayed = await releaseRepository.createOnce({ ...input, id: `${prefix}-release-retry` });

  expect(created).toMatchObject({
    id: input.id,
    changeId: change.id,
    action: 'publish-website',
    target: change.target,
    baseHash,
    sourceHash: change.candidateHash,
    publishApproval,
    stage: 'PREPARED',
    assistantIndexState: 'PENDING',
    manifestHash: null,
    manifestRef: null,
    verifiedHash: null,
    verifiedAt: null,
  });
  expect(replayed).toEqual(created);
  expect(await releaseRepository.listForChange(change.id)).toEqual([created]);

  await kernel.close();
  opened = opened.filter((module) => module !== kernel);
  const restartedKernel = await createKernel();
  opened.push(restartedKernel);
  const restartedRepository = restartedKernel.get(CONTENT_RELEASE_REPOSITORY) as ContentReleaseRepositoryPort;
  expect(await restartedRepository.findById(created.id)).toEqual(created);
  expect(await restartedRepository.findByRequestKey(input.requestKey)).toEqual(created);
});

it('网页发布不能跳过候选的应用状态', async () => {
  const kernel = await createKernel();
  opened.push(kernel);
  const changeRepository = kernel.get<ContentChangeRepositoryPort>(CONTENT_CHANGE_REPOSITORY);
  const change = proposal({ id: `${prefix}-unapplied-change`, requestKey: `${prefix}-unapplied-proposal` });
  await changeRepository.createOnce(change);
  const baseHash = 'e'.repeat(64);
  const publishApproval = makeApproval({
    action: 'publish-website',
    target: change.target,
    baseHash,
    candidateHash: change.candidateHash,
    id: `${prefix}-unapplied-approval`,
    grantId: `${prefix}-unapplied-grant`,
    grantRevision: 1,
  });
  const releaseRepository = kernel.get(CONTENT_RELEASE_REPOSITORY) as ContentReleaseRepositoryPort;

  await expect(releaseRepository.createOnce({
    id: `${prefix}-unapplied-release`,
    changeId: change.id,
    target: change.target,
    baseHash,
    sourceHash: change.candidateHash,
    publishApproval,
    requestKey: `${prefix}-unapplied-release-request`,
  })).rejects.toMatchObject({ response: { code: 'content-release-conflict' } });
  expect(await kernel.get<PrismaPort>(PRISMA).getClient()?.contentRelease.count({
    where: { changeId: change.id },
  })).toBe(0);
});
