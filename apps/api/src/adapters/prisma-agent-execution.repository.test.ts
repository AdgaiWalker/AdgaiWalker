import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { IdempotencyConflictError } from './prisma-agent-execution.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { AGENT_EXECUTION_REPOSITORY, type AgentExecutionRepositoryPort } from '../ports/agent-execution.repository';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';

let db: PrismaClient;
let repository: AgentExecutionRepositoryPort;
let module: TestingModule;
const scope = `agent-run-test-${randomUUID()}`;
const id = randomUUID();
const now = new Date();

beforeAll(async () => {
  vi.stubEnv('AI_ENABLED', 'false');
  module = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] }).compile();
  db = module.get<PrismaPort>(PRISMA).getClient()!;
  repository = module.get<AgentExecutionRepositoryPort>(AGENT_EXECUTION_REPOSITORY);
});
afterAll(async () => {
  await db?.executionRun.deleteMany({ where: { actorScope: scope } });
  await module?.close();
  vi.unstubAllEnvs();
});

describe('Agent 执行仓储 CAS', () => {
  it('请求键幂等、双领取只有一个成功，迟到结果不覆盖取消', async () => {
    const draft = {
      id, kind: 'chat', origin: 'admin' as const, actor: 'owner', actorScope: scope,
      agentRevisionId: null, requestKey: 'same-request', inputHash: 'a'.repeat(64), deadline: null,
    };
    expect((await repository.submitIfAbsent(draft)).created).toBe(true);
    const duplicate = await repository.submitIfAbsent({ ...draft, id: randomUUID() });
    expect(duplicate).toMatchObject({ created: false, run: { id } });
    await expect(repository.submitIfAbsent({ ...draft, id: randomUUID(), inputHash: 'b'.repeat(64) }))
      .rejects.toBeInstanceOf(IdempotencyConflictError);

    const leaseUntil = new Date(now.getTime() + 60_000);
    const claims = await Promise.all([
      repository.claim(id, 'worker-a', now, leaseUntil),
      repository.claim(id, 'worker-b', now, leaseUntil),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const claimed = claims.find(Boolean)!;
    expect(claimed.leaseEpoch).toBe(1);
    expect(await repository.renewLease(id, claimed.leaseOwner!, 0, now, leaseUntil)).toBe(false);
    expect(await repository.renewLease(id, claimed.leaseOwner!, 1, now, leaseUntil)).toBe(true);

    expect(await repository.setStateUnless({ id, from: ['CLAIMED'], to: 'RUNNING', epoch: 1, owner: claimed.leaseOwner! })).toBe(true);
    expect(await repository.setStateUnless({ id, from: ['RUNNING'], to: 'STOPPING', epoch: 1 })).toBe(true);
    expect(await repository.setStateUnless({ id, from: ['RUNNING'], to: 'SUCCEEDED', epoch: 1, owner: claimed.leaseOwner! })).toBe(false);
    expect(await repository.setStateUnless({ id, from: ['STOPPING'], to: 'CANCELLED', epoch: 1, stopReason: 'user' })).toBe(true);
    expect(await repository.setStateUnless({ id, from: ['STOPPING'], to: 'FAILED', epoch: 1 })).toBe(false);
    expect((await repository.findById(id))).toMatchObject({ state: 'CANCELLED', stopReason: 'user', leaseOwner: null });
    await expect(repository.setStateUnless({ id, from: ['CANCELLED'], to: 'RUNNING', epoch: 1 })).rejects.toThrow('非法');
  });
});
