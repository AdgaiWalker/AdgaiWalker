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
const resourceConversation = `v17-resource-${randomUUID()}`;
const now = new Date();

beforeAll(async () => {
  vi.stubEnv('AI_ENABLED', 'false');
  module = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] }).compile();
  db = module.get<PrismaPort>(PRISMA).getClient()!;
  repository = module.get<AgentExecutionRepositoryPort>(AGENT_EXECUTION_REPOSITORY);
});
afterAll(async () => {
  await db?.conversationLogResource.deleteMany({ where: { conversationId: resourceConversation } });
  const runs = await db?.executionRun.findMany({ where: { actorScope: scope }, select: { id: true } });
  const runIds = runs?.map((run) => run.id) ?? [];
  await db?.conversationLogResource.deleteMany({ where: { OR: [
    { resourceType: 'execution-run', resourceKey: { in: runIds } },
    { resourceType: 'execution-event', parentKey: { in: runIds } },
  ] } });
  await db?.executionEvent.deleteMany({ where: { runId: { in: runIds } } });
  await db?.processRecord.deleteMany({ where: { runId: { in: runIds } } });
  await db?.executionRun.deleteMany({ where: { actorScope: scope } });
  await module?.close();
  vi.unstubAllEnvs();
});

describe('Agent 执行仓储 CAS', () => {
  it('公开运行和实际输出事件登记为会话资源', async () => {
    const runId = randomUUID();
    await repository.submitIfAbsent({
      id: runId, kind: 'chat', origin: 'public', actor: 'visitor', actorScope: scope,
      agentRevisionId: null, requestKey: `resource-${randomUUID()}`, inputHash: 'e'.repeat(64), deadline: null,
      conversationId: resourceConversation,
    });
    await repository.appendEvent({ runId, kind: 'text', text: '一段实际输出' });

    await expect(db.conversationLogResource.findUnique({
      where: { resourceType_resourceKey: { resourceType: 'execution-run', resourceKey: runId } },
    })).resolves.toMatchObject({ conversationId: resourceConversation });
    await expect(db.conversationLogResource.findUnique({
      where: { resourceType_resourceKey: { resourceType: 'execution-event', resourceKey: `${runId}:1` } },
    })).resolves.toMatchObject({ conversationId: resourceConversation, parentKey: runId });
  });

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

  /**
   * 回归（R33，站主实测「只见输入不见输出」的深层原因）：
   * 事件现在会被写两次——运行中观察回调实时写一次（让 SSE 断掉的客户端也能查到），
   * 运行结束时 follow 按 seen 批量补写一次。appendEvent 必须幂等，
   * 否则补写撞唯一键抛错，把一次**成功的运行**标成 FAILED。
   */
  /**
   * 回归（R33，站主实测「只见输入不见输出」的深层原因）：
   * 事件有两个写入方——运行中观察回调实时写、结束时 follow 按 seen 批量补写。
   * 并发时两边会读到同一个最大 seq 并撞 `@@unique([runId, seq])`，
   * 原实现直接抛 Prisma 错误，把一次**成功的运行**标成 FAILED。
   * 契约：appendEvent 并发安全——撞键时重读 seq 返回，绝不抛错。
   */
  it('appendEvent 并发安全：撞 unique 键时不抛错、事件不丢', async () => {
    const runId = randomUUID();
    const draft = {
      id: runId, kind: 'chat' as const, origin: 'admin' as const, actor: 'owner', actorScope: scope,
      agentRevisionId: null, requestKey: 'evtest-' + randomUUID().slice(0, 8), inputHash: 'c'.repeat(64), deadline: null,
    };
    await repository.submitIfAbsent(draft);
    try {
      // 并发写 6 条（模拟实时写 + 批量补写竞争同一 seq 窗口）
      const writes = await Promise.all([
        repository.appendEvent({ runId, kind: 'text', text: 'a' }),
        repository.appendEvent({ runId, kind: 'text', text: 'b' }),
        repository.appendEvent({ runId, kind: 'usage', tokensIn: 1, tokensOut: 1 }),
        repository.appendEvent({ runId, kind: 'text', text: 'c' }),
        repository.appendEvent({ runId, kind: 'text', text: 'd' }),
        repository.appendEvent({ runId, kind: 'usage', tokensIn: 2, tokensOut: 2 }),
      ]);
      // 全部成功返回 seq（无抛错）
      expect(writes.every((n) => typeof n === 'number')).toBe(true);
      // 6 条全部落库、seq 唯一
      const events = await repository.listEvents(runId, 0, 20);
      expect(events).toHaveLength(6);
      const seqs = events.map((e) => e.seq);
      expect(new Set(seqs).size).toBe(6);
    } finally {
      await db.executionEvent.deleteMany({ where: { runId } });
      await db.executionRun.deleteMany({ where: { id: runId } });
    }
  });
});
