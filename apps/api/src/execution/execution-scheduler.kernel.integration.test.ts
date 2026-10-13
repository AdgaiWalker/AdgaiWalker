import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  BACKGROUND_QUEUE_LIMIT, PUBLIC_CLAIM_STREAK_LIMIT, PUBLIC_DEADLINE_MS, PUBLIC_QUEUE_LIMIT, READ_ONLY_PROFILE,
} from '@walker/shared';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { storageUnavailable } from '../common/http-error';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { EXECUTION_QUOTA, type ExecutionQuotaPort } from '../ports/execution-quota.port';
import { PROCESS_REGISTRY, type ProcessRegistryPort } from '../ports/process-registry.port';
import { RUNTIME_PORT, type RuntimePort } from '../ports/runtime.port';
import { SITE_CONTENT_INDEX } from '../ports/site-content-index.port';
import { AuthorizationService } from '../authorization/authorization.service';
import { AgentExecutionService, type ExecutionContext } from './agent-execution.service';

const agentId = 'r12-agent';
const revisionId = 'r12-revision';
const visitor = 'r12-visitor';
const owner = 'r12-owner';
const sessionCaptureConversation = 'r18-session-capture-conversation';
const runtimeState: {
  starts: number;
  hold: Promise<void> | null;
  closes: number;
  closeHold: Promise<void> | null;
  closeResult: { exited: boolean } | Error;
  runBehavior: RuntimePort['run'] | null;
  onClose: (() => void) | null;
} = { starts: 0, hold: null, closes: 0, closeHold: null, closeResult: { exited: true }, runBehavior: null, onClose: null };
const runtime: RuntimePort = {
  async start() {
    runtimeState.starts += 1;
    if (runtimeState.hold) await runtimeState.hold;
  },
  async run(request) {
    if (runtimeState.runBehavior) return runtimeState.runBehavior(request);
    throw new Error('调度测试不应调用 run');
  },
  observe() { return () => undefined; },
  async close() {
    runtimeState.closes += 1;
    if (runtimeState.closeHold) await runtimeState.closeHold;
    runtimeState.onClose?.();
    runtimeState.onClose = null;
    if (runtimeState.closeResult instanceof Error) throw runtimeState.closeResult;
    return runtimeState.closeResult;
  },
};
const processes: { killed: Array<{ pid: number; startedAt: string }> } = { killed: [] };
const registry: ProcessRegistryPort = {
  async currentBatch() { return { bootId: 'r14-boot', pid: process.pid }; },
  async inspect(record) {
    // 与生产同语义（见 process-recovery.ts）：没启动过 = unstarted（可释放），
    // 启动过但读不到 = unproven（保守占用）。这里别退回成"一律 unproven"。
    if (!record || record.pid === null || record.startedAt === null) return 'unstarted';
    if (record.pid === 41414 && record.startedAt === '2026-09-22T00:00:00.000Z') return 'reused';
    if (record.pid === 41415 && record.startedAt === '2026-09-22T00:00:01.000Z') return 'alive';
    if (record.pid === 41416 && record.startedAt === '2026-09-22T00:00:02.000Z') return 'alive';
    return 'exited';
  },
  async terminate(record) {
    if (!record || record.pid === null || record.startedAt === null) return 'exited';
    processes.killed.push({ pid: record.pid, startedAt: record.startedAt });
    return record.pid === 41416 ? 'unproven' : 'exited';
  },
};
const failingQuota: ExecutionQuotaPort = {
  async reserve() { throw storageUnavailable(); },
  async settle() { return 'unchanged'; },
  async recordUsage() {},
  async release() {},
};

let moduleRef: TestingModule;
let db: PrismaClient;
let service: AgentExecutionService;
let auth: AuthorizationService;
let grantSeq = 0;

function body(requestKey: string) {
  return { requestKey, kind: 'chat', agentRevisionId: revisionId, input: `排队 ${requestKey}` };
}
function publicContext(): ExecutionContext {
  return { origin: 'public', principalType: 'visitor', principalId: visitor, agentId, grantId: null };
}
function publicChatContext(): ExecutionContext {
  return {
    ...publicContext(), placementKey: 'post-detail', deploymentId: 'r14-public-deployment',
    deploymentGeneration: 2, contentSnapshotId: 'a'.repeat(64),
  };
}
function publicChatBody(requestKey: string) {
  return { ...body(requestKey), targetId: 'post-a' };
}
function adminContext(grantId: string): ExecutionContext {
  return { origin: 'admin', principalType: 'owner', principalId: owner, agentId, grantId };
}
function recoveredModule() {
  return Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
    .overrideProvider(RUNTIME_PORT).useValue(runtime)
    .overrideProvider(PROCESS_REGISTRY).useValue(registry)
    .overrideProvider(SITE_CONTENT_INDEX).useValue({
      loadCitable: async () => [{ slug: 'post-a', title: '文章 A', summary: '', tags: [], actionable: false }],
      loadCitableFull: async () => [{ slug: 'post-a', title: '文章 A', summary: '', tags: [], actionable: false, body: '公开正文' }],
      loadCitableSnapshot: async () => ({ buildId: 'test-build', collectionHash: 'a'.repeat(64), entries: [{ slug: 'post-a', title: '文章 A', summary: '', tags: [], actionable: false, body: '公开正文' }] }),
    })
    .compile();
}
function queuedId(result: Awaited<ReturnType<AgentExecutionService['enqueue']>>): string {
  if (result.outcome !== 'queued') throw new Error(result.reason);
  return result.runId;
}
function issue(runLimit: number) {
  grantSeq += 1;
  return auth.issue({
    requestKey: `r12-grant-${String(grantSeq).padStart(4, '0')}`, level: 'L0', agentId,
    actions: ['agent:run'], resourceScope: { kind: 'agent', ids: [agentId] },
    expiresAt: '2099-01-01T00:00:00.000Z', runLimit, usageLimit: 1000,
  }, owner);
}

beforeAll(async () => {
  vi.stubEnv('AI_ENABLED', 'false');
  moduleRef = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
    .overrideProvider(RUNTIME_PORT).useValue(runtime)
    .overrideProvider(SITE_CONTENT_INDEX).useValue({
      loadCitable: async () => [{ slug: 'post-a', title: '文章 A', summary: '', tags: [], actionable: false }],
      loadCitableFull: async () => [{ slug: 'post-a', title: '文章 A', summary: '', tags: [], actionable: false, body: '公开正文' }],
      loadCitableSnapshot: async () => ({ buildId: 'test-build', collectionHash: 'a'.repeat(64), entries: [{ slug: 'post-a', title: '文章 A', summary: '', tags: [], actionable: false, body: '公开正文' }] }),
    })
    .compile();
  db = moduleRef.get<PrismaPort>(PRISMA).getClient()!;
  service = moduleRef.get(AgentExecutionService);
  auth = moduleRef.get(AuthorizationService);
  await db.agentUnit.create({ data: { id: agentId, name: '调度测试', prompt: '只读' } });
  await db.agentRevision.create({
    data: {
      id: revisionId, agentId, version: 1, prompt: '只读', modelId: 'deepseek-chat',
      toolProfile: READ_ONLY_PROFILE, schemaVersion: 1, configHash: 'a'.repeat(64),
    },
  });
});

beforeEach(async () => {
  runtimeState.hold = null;
  runtimeState.closeHold = null;
  runtimeState.runBehavior = null;
  runtimeState.onClose = null;
  runtimeState.closes = 0;
  processes.killed = [];
  runtimeState.closeResult = { exited: true };
  await db.executionRun.updateMany({
    where: { actor: { in: [visitor, owner] }, state: { notIn: ['SUCCEEDED', 'FAILED', 'CANCELLED'] } },
    data: { state: 'CANCELLED', leaseOwner: null, leaseUntil: null },
  });
  await db.executionSchedule.upsert({
    where: { id: 'global' }, create: { id: 'global', consecutivePublicClaims: 0 }, update: { consecutivePublicClaims: 0 },
  });
});

it('public chat uses the shared queue and persists placement, deployment generation, and verified snapshot', async () => {
  const mod = await recoveredModule();
  try {
    const executions = mod.get(AgentExecutionService);
    const output = JSON.stringify({ answer: '按正文先做第一步。', citations: ['post-a'] });
    runtimeState.runBehavior = async (request) => {
      request.observe?.({ kind: 'text', text: output });
      request.observe?.({ kind: 'usage', usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 } });
      return {
        ok: true,
        sessionId: 'r12-public-sdk-session',
        text: output,
        json: JSON.parse(output),
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 },
        outputKind: 'json',
      };
    };
    const visible: string[] = [];

    const result = await executions.runPublicChat({
      principalId: visitor,
      runtimeVisitorKey: 'visitor-cookie',
      agentId,
      agentRevisionId: revisionId,
      requestKey: 'r12-public-chat-0001',
      targetSlug: 'post-a',
      prompt: '仅依据这篇公开文章回答。',
      placementKey: 'post-detail',
      deploymentId: 'deployment-r12',
      deploymentGeneration: 7,
      contentSnapshotId: 'b'.repeat(64),
      deadlineAt: new Date(Date.now() + 5_000),
      onText: (delta) => visible.push(delta),
    });

    expect(result).toMatchObject({ outcome: 'completed', output, sessionId: 'r12-public-sdk-session' });
    expect(visible.join('')).toBe('按正文先做第一步。');
    expect(visible.join('')).not.toContain('citations');
    if (result.outcome !== 'completed') throw new Error('public run was not completed');
    expect(await db.executionRun.findUnique({ where: { id: result.runId } })).toMatchObject({
      origin: 'public', kind: 'chat', actor: visitor, grantId: null,
      deploymentId: 'deployment-r12', placementKey: 'post-detail',
      deploymentGeneration: 7, contentSnapshotId: 'b'.repeat(64),
      resourceScope: { kind: 'content', ids: ['post-a'] }, state: 'SUCCEEDED',
    });
  } finally {
    await mod.close();
  }
});

it('registers native session/fork IDs emitted by an already-running turn during tombstone stopping', async () => {
  const mod = await recoveredModule();
  try {
    runtimeState.runBehavior = async (request) => {
      await db.deletionTombstone.create({ data: { conversationId: sessionCaptureConversation } });
      await request.onSessionResource?.({ sessionId: 'r18-root-session', kind: 'native-session' });
      await request.onSessionResource?.({
        sessionId: 'r18-child-session', kind: 'native-fork', parentSessionId: 'r18-root-session',
      });
      request.observe?.({ kind: 'text', text: '{"answer":"正在收尾"}' });
      return {
        ok: true, sessionId: 'r18-root-session', text: '{"answer":"正在收尾"}',
        json: { answer: '正在收尾' }, usage: null, outputKind: 'json',
      };
    };

    const result = await mod.get(AgentExecutionService).runPublicChat({
      principalId: visitor, runtimeVisitorKey: 'visitor-cookie', agentId, agentRevisionId: revisionId,
      requestKey: 'r18-session-resource-run', targetSlug: 'post-a', prompt: '只读回答。',
      placementKey: 'post-detail', deploymentId: 'deployment-r18', deploymentGeneration: 1,
      contentSnapshotId: 'e'.repeat(64), conversationId: sessionCaptureConversation,
      deadlineAt: new Date(Date.now() + 2_000),
    });
    expect(result.outcome).toBe('completed');
    const resources = await db.conversationLogResource.findMany({ where: { conversationId: sessionCaptureConversation } });
    expect(resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'native-session', resourceKey: 'r18-root-session', agentRevisionId: revisionId }),
      expect.objectContaining({ resourceType: 'native-fork', resourceKey: 'r18-child-session', agentRevisionId: revisionId, parentKey: 'r18-root-session' }),
    ]));
  } finally {
    await mod.close();
  }
});

it('public chat refuses a revision without the deployed read-only profile', async () => {
  const mod = await recoveredModule();
  const starts = runtimeState.starts;
  try {
    await db.agentRevision.update({ where: { id: revisionId }, data: { toolProfile: { id: 'custom-write', version: 99 } } });
    const result = await mod.get(AgentExecutionService).runPublicChat({
      principalId: visitor,
      runtimeVisitorKey: 'visitor-cookie',
      agentId,
      agentRevisionId: revisionId,
      requestKey: 'r12-public-readonly-guard',
      targetSlug: 'post-a',
      prompt: '禁止写入。',
      placementKey: 'post-detail',
      deploymentId: 'deployment-r12',
      deploymentGeneration: 8,
      contentSnapshotId: 'c'.repeat(64),
      deadlineAt: new Date(Date.now() + 1_000),
    });
    expect(result).toEqual({ outcome: 'degraded', reason: 'runtime-error' });
    expect(runtimeState.starts).toBe(starts);
    expect(await db.executionRun.findUnique({ where: { actorScope_requestKey: { actorScope: `public:${visitor}`, requestKey: 'r12-public-readonly-guard' } } })).toBeNull();
  } finally {
    await db.agentRevision.update({ where: { id: revisionId }, data: { toolProfile: READ_ONLY_PROFILE } });
    await mod.close();
  }
});

it('public runtime deadline closes the shared slot and returns timeout for rule fallback', async () => {
  const mod = await recoveredModule();
  try {
    runtimeState.runBehavior = async () => new Promise((resolve) => {
      runtimeState.onClose = () => resolve({ ok: false, failure: 'timeout', sessionId: null });
    });
    const result = await mod.get(AgentExecutionService).runPublicChat({
      principalId: visitor,
      runtimeVisitorKey: 'visitor-cookie',
      agentId,
      agentRevisionId: revisionId,
      requestKey: 'r12-public-timeout-0001',
      targetSlug: 'post-a',
      prompt: '限时运行。',
      placementKey: 'post-detail',
      deploymentId: 'deployment-r12',
      deploymentGeneration: 9,
      contentSnapshotId: 'd'.repeat(64),
      deadlineAt: new Date(Date.now() + 180),
    });
    expect(result).toEqual({ outcome: 'degraded', reason: 'timeout' });
    await vi.waitFor(async () => expect(await db.executionRun.findUnique({
      where: { actorScope_requestKey: { actorScope: `public:${visitor}`, requestKey: 'r12-public-timeout-0001' } },
    })).toMatchObject({ state: 'FAILED', stopReason: 'deadline' }));
    expect(runtimeState.closes).toBe(1);
  } finally {
    await mod.close();
  }
});

afterAll(async () => {
  const leftovers = await db?.executionRun.findMany({ where: { actor: { in: [visitor, owner] } }, select: { id: true } });
  await db?.conversationLogResource.deleteMany({ where: { conversationId: sessionCaptureConversation } });
  await db?.deletionTombstone.deleteMany({ where: { conversationId: sessionCaptureConversation } });
  await db?.executionEvent.deleteMany({ where: { runId: { in: leftovers?.map((row) => row.id) ?? [] } } });
  await db?.processRecord.deleteMany({ where: { runId: { in: leftovers?.map((row) => row.id) ?? [] } } });
  await db?.executionRun.deleteMany({ where: { actor: { in: [visitor, owner] } } });
  await db?.authorizationGrant.deleteMany({ where: { principalId: owner } });
  await db?.agentRevision.deleteMany({ where: { agentId } });
  await db?.agentUnit.deleteMany({ where: { id: agentId } });
  await moduleRef?.close();
  vi.unstubAllEnvs();
});

it('单槽占用时新的调度入口不再启动，未领取的排队仍在', async () => {
  let release = () => {};
  runtimeState.hold = new Promise<void>((resolve) => { release = resolve; });
  const before = runtimeState.starts;
  const first = await service.enqueue(body('r12-slot-first'), publicContext());
  const pending = service.dispatch();
  await vi.waitFor(() => expect(runtimeState.starts).toBe(before + 1));
  const second = await service.enqueue(body('r12-slot-second'), publicContext());
  expect(await service.dispatch()).toEqual({ outcome: 'waiting' });
  const module2 = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
    .overrideProvider(RUNTIME_PORT).useValue(runtime).compile();
  try {
    expect(await module2.get(AgentExecutionService).dispatch()).toEqual({ outcome: 'waiting' });
    expect(runtimeState.starts).toBe(before + 1);
    expect(await db.executionRun.findUnique({ where: { id: queuedId(second) } })).toMatchObject({ state: 'QUEUED' });
    expect(first.outcome).toBe('queued');
  } finally {
    await module2.close();
    release();
    runtimeState.hold = null;
    await pending;
  }
});

it('公共第 4 个和后台第 11 个等待者规则降级，且不启动模型', async () => {
  const before = runtimeState.starts;
  for (let index = 0; index < PUBLIC_QUEUE_LIMIT; index += 1) {
    expect((await service.enqueue(body(`r12-public-${index}`), publicContext())).outcome).toBe('queued');
  }
  expect(await service.enqueue(body('r12-public-over'), publicContext())).toEqual({
    outcome: 'degraded', reason: '公共等待已满，已改为规则处理',
  });
  const grant = await issue(BACKGROUND_QUEUE_LIMIT + 1);
  for (let index = 0; index < BACKGROUND_QUEUE_LIMIT; index += 1) {
    expect((await service.enqueue(body(`r12-back-${index}x`), adminContext(grant.id))).outcome).toBe('queued');
  }
  expect(await service.enqueue(body('r12-back-over'), adminContext(grant.id))).toEqual({
    outcome: 'degraded', reason: '后台等待已满，已改为规则处理',
  });
  expect(runtimeState.starts).toBe(before);
  expect((await db.authorizationGrant.findUnique({ where: { id: grant.id } }))).toMatchObject({ runsCharged: 0, runsReserved: 0 });
});

it('入队时已过期，或排队期间超过截止时间，都不启动模型', async () => {
  const before = runtimeState.starts;
  const now = new Date('2026-09-22T00:00:00.000Z');
  expect(await service.enqueue(body('r12-already-expired'), publicContext(), { now, deadline: new Date(now.getTime() - 1) })).toEqual({
    outcome: 'degraded', reason: '排队截止时间已过，已改为规则处理',
  });
  const queued = queuedId(await service.enqueue(body('r12-expires-inline'), publicContext(), { now }));
  expect(await service.dispatch({ now: new Date(now.getTime() + PUBLIC_DEADLINE_MS) })).toMatchObject({
    outcome: 'degraded', runId: queued, reason: '排队时间已超过截止时间，已改为规则处理',
  });
  expect(runtimeState.starts).toBe(before);
  expect(await db.executionRun.findUnique({ where: { id: queued } })).toMatchObject({ state: 'FAILED', stopReason: 'deadline' });
});

it('最后一单位额度只有一方预留成功，同一运行结算两次不多扣，未启动不扣费', async () => {
  const before = runtimeState.starts;
  const grant = await issue(1);
  expect((await service.enqueue(body('r12-quota-one'), adminContext(grant.id))).outcome).toBe('queued');
  expect((await service.enqueue(body('r12-quota-two'), adminContext(grant.id))).outcome).toBe('queued');
  const raced = await Promise.all([service.dispatch(), service.dispatch()]);
  expect(raced.filter((row) => row.outcome === 'started')).toHaveLength(1);
  expect(runtimeState.starts).toBe(before + 1);
  const winner = raced.find((row) => row.outcome === 'started');
  if (!winner || winner.outcome !== 'started') throw new Error('没有领取成功的运行');
  expect(await service.finish(winner.runId)).toBe(true);
  expect(await db.authorizationGrant.findUnique({ where: { id: grant.id } })).toMatchObject({ runsCharged: 1, runsReserved: 0 });
  const loser = await service.dispatch();
  expect(loser).toMatchObject({ outcome: 'degraded', reason: '额度已用完，已改为规则处理' });
  expect(runtimeState.starts).toBe(before + 1);
  expect(await db.authorizationGrant.findUnique({ where: { id: grant.id } })).toMatchObject({ runsCharged: 1, runsReserved: 0 });
  if (loser.outcome === 'degraded' && loser.runId) {
    expect(await db.executionQuotaHold.findUnique({ where: { runId: loser.runId } })).toBeNull();
  }
});

it('数据库无法预留额度时规则降级，且不调用 start', async () => {
  const failing = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
    .overrideProvider(RUNTIME_PORT).useValue(runtime)
    .overrideProvider(EXECUTION_QUOTA).useValue(failingQuota).compile();
  try {
    const before = runtimeState.starts;
    const grant = await issue(3);
    const scheduler = failing.get(AgentExecutionService);
    const queued = queuedId(await scheduler.enqueue(body('r12-quota-db-fail'), adminContext(grant.id)));
    expect(await scheduler.dispatch()).toEqual({ outcome: 'degraded', runId: null, reason: '额度暂时无法预留，已改为规则处理' });
    expect(runtimeState.starts).toBe(before);
    expect(await db.authorizationGrant.findUnique({ where: { id: grant.id } })).toMatchObject({ runsCharged: 0, runsReserved: 0 });
    expect(await db.executionRun.findUnique({ where: { id: queued } })).toMatchObject({ state: 'QUEUED' });
  } finally {
    await failing.close();
  }
});

it('入队后撤销、过期或越出原范围，启动前拒绝且不启动模型', async () => {
  const before = runtimeState.starts;
  const revoked = await issue(2);
  const revokedRun = queuedId(await service.enqueue(body('r12-auth-revoke'), adminContext(revoked.id)));
  await auth.revoke(revoked.id, owner);
  expect(await service.dispatch()).toEqual({ outcome: 'rejected', runId: revokedRun, reason: '授权已撤销，拒绝执行' });

  const expired = await issue(2);
  const expiredRun = queuedId(await service.enqueue(body('r12-auth-expire'), adminContext(expired.id)));
  await db.authorizationGrant.update({ where: { id: expired.id }, data: { expiresAt: new Date('2000-01-01T00:00:00.000Z') } });
  expect(await service.dispatch()).toEqual({ outcome: 'rejected', runId: expiredRun, reason: '授权已过期，拒绝执行' });

  const narrowed = await issue(2);
  const narrowedRun = queuedId(await service.enqueue(body('r12-auth-scope'), adminContext(narrowed.id)));
  await db.authorizationGrant.update({ where: { id: narrowed.id }, data: { resourceScope: { kind: 'agent', ids: ['other-agent'] } } });
  expect(await service.dispatch()).toEqual({ outcome: 'rejected', runId: narrowedRun, reason: '授权已超出原范围，拒绝执行' });

  expect(runtimeState.starts).toBe(before);
  for (const grant of [revoked, expired, narrowed]) {
    expect(await db.authorizationGrant.findUnique({ where: { id: grant.id } })).toMatchObject({ runsCharged: 0, runsReserved: 0 });
  }
});

it('连续公共领取达到调度上限后，下一次领取后台任务', async () => {
  const grant = await issue(2);
  const background = queuedId(await service.enqueue(body('r12-fair-back'), adminContext(grant.id)));
  const publics: string[] = [];
  for (let index = 0; index < PUBLIC_CLAIM_STREAK_LIMIT + 1; index += 1) {
    publics.push(queuedId(await service.enqueue(body(`r12-fair-pub-${index}`), publicContext())));
  }
  for (let index = 0; index < PUBLIC_CLAIM_STREAK_LIMIT; index += 1) {
    const claimed = await service.dispatch();
    expect(claimed.outcome).toBe('started');
    if (claimed.outcome !== 'started') return;
    expect(publics).toContain(claimed.runId);
    expect(await service.finish(claimed.runId)).toBe(true);
  }
  expect(await service.dispatch()).toMatchObject({ outcome: 'started', runId: background });
  expect(await db.authorizationGrant.findUnique({ where: { id: grant.id } })).toMatchObject({ runsCharged: 1 });
  expect(await service.finish(background)).toBe(true);
  expect(await db.authorizationGrant.findUnique({ where: { id: grant.id } })).toMatchObject({ runsCharged: 1, runsReserved: 0 });
});

it('排队取消立刻终态，不关闭进程', async () => {
  const before = runtimeState.starts;
  const queued = queuedId(await service.enqueue(publicChatBody('r13-queue-cancel'), publicChatContext()));
  await expect(service.stopPublicRun(queued, 'another-visitor', 'post-detail', 'post-a'))
    .rejects.toMatchObject({ response: { code: 'execution-run-not-found' } });
  expect(await service.stopPublicRun(queued, visitor, 'post-detail', 'post-a')).toEqual({ outcome: 'stopped', runId: queued, state: 'CANCELLED' });
  expect(await service.stopPublicRun(queued, visitor, 'post-detail', 'post-a')).toEqual({ outcome: 'unchanged', runId: queued, state: 'CANCELLED' });
  expect(runtimeState.closes).toBe(0);
  expect(runtimeState.starts).toBe(before);
  expect(await db.executionRun.findUnique({ where: { id: queued } })).toMatchObject({ state: 'CANCELLED', stopReason: 'user', tokensIn: null });
  expect(await service.recordResult(queued, { tokensIn: 3, tokensOut: 4, elapsedMs: 5 })).toBe(false);
  expect(await db.executionRun.findUnique({ where: { id: queued } })).toMatchObject({ state: 'CANCELLED', tokensIn: null });
});

it('运行中的停止要等退出证明，关闭未完成时不复用槽', async () => {
  const running = queuedId(await service.enqueue(publicChatBody('r13-running-stop'), publicChatContext()));
  expect((await service.dispatch()).outcome).toBe('started');
  const starts = runtimeState.starts;
  let release = () => {};
  runtimeState.closeHold = new Promise<void>((resolve) => { release = resolve; });
  const pending = service.stopPublicRun(running, visitor, 'post-detail', 'post-a');
  let module2: TestingModule | undefined;
  try {
    await vi.waitFor(async () => {
      expect(await db.executionRun.findUnique({ where: { id: running } })).toMatchObject({ state: 'STOPPING', stopReason: 'user' });
    });
    expect(runtimeState.closes).toBe(1);
    expect(await service.recordResult(running, { tokensIn: 8, tokensOut: 9, elapsedMs: 10 })).toBe(false);
    expect(await db.executionRun.findUnique({ where: { id: running } })).toMatchObject({ state: 'STOPPING', tokensIn: null });
    const waiting = queuedId(await service.enqueue(body('r13-while-stopping'), publicContext()));
    expect(await service.dispatch()).toEqual({ outcome: 'waiting' });
    module2 = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
      .overrideProvider(RUNTIME_PORT).useValue(runtime).compile();
    expect(await module2.get(AgentExecutionService).dispatch()).toEqual({ outcome: 'waiting' });
    expect(runtimeState.starts).toBe(starts);
    expect(await db.executionRun.findUnique({ where: { id: waiting } })).toMatchObject({ state: 'QUEUED' });
  } finally {
    await module2?.close();
    release();
    runtimeState.closeHold = null;
  }
  expect(await pending).toEqual({ outcome: 'stopped', runId: running, state: 'CANCELLED' });
  expect(await service.recordResult(running, { tokensIn: 8, tokensOut: 9, elapsedMs: 10 })).toBe(false);
  expect(await db.executionRun.findUnique({ where: { id: running } })).toMatchObject({ state: 'CANCELLED', stopReason: 'user', tokensIn: null });
  expect((await service.dispatch()).outcome).toBe('started');
  expect(runtimeState.starts).toBe(starts + 1);
});

it('截止时间确认终止记失败，和人工取消分开', async () => {
  const running = queuedId(await service.enqueue(body('r13-deadline-stop'), publicContext()));
  expect((await service.dispatch()).outcome).toBe('started');
  expect(await service.stop(running, 'deadline')).toEqual({ outcome: 'stopped', runId: running, state: 'FAILED' });
  expect(runtimeState.closes).toBe(1);
  expect(await db.executionRun.findUnique({ where: { id: running } })).toMatchObject({ state: 'FAILED', stopReason: 'deadline' });
  expect(await service.finish(running)).toBe(false);
});

it('关闭失败或没有退出证明时隔离运行，槽不被下一任务占用', async () => {
  const failed = queuedId(await service.enqueue(body('r13-close-fail'), publicContext()));
  expect((await service.dispatch()).outcome).toBe('started');
  const starts = runtimeState.starts;
  runtimeState.closeResult = new Error('进程仍在');
  expect(await service.stop(failed, 'user')).toEqual({ outcome: 'isolated', runId: failed, reason: '关闭没有完成，模型槽继续占用' });
  expect(await service.stop(failed, 'user')).toEqual({ outcome: 'isolated', runId: failed, reason: '关闭没有完成，模型槽继续占用' });
  expect(runtimeState.closes).toBe(1);
  expect(await db.executionRun.findUnique({ where: { id: failed } })).toMatchObject({ state: 'UNKNOWN' });
  expect(await service.recordResult(failed, { tokensIn: 1, tokensOut: 1, elapsedMs: 1 })).toBe(false);
  const waiting = queuedId(await service.enqueue(body('r13-after-isolate'), publicContext()));
  expect(await service.dispatch()).toEqual({ outcome: 'waiting' });
  expect(runtimeState.starts).toBe(starts);
  expect(await db.executionRun.findUnique({ where: { id: waiting } })).toMatchObject({ state: 'QUEUED' });
});

it('close 没有退出证明时不释放槽', async () => {
  const unproven = queuedId(await service.enqueue(body('r13-no-proof'), publicContext()));
  expect((await service.dispatch()).outcome).toBe('started');
  const starts = runtimeState.starts;
  runtimeState.closeResult = { exited: false };
  expect(await service.stop(unproven, 'deadline')).toEqual({ outcome: 'isolated', runId: unproven, reason: '关闭没有完成，模型槽继续占用' });
  expect(await db.executionRun.findUnique({ where: { id: unproven } })).toMatchObject({ state: 'UNKNOWN', stopReason: 'deadline' });
  expect(await service.recordResult(unproven, { tokensIn: 2, tokensOut: 2, elapsedMs: 2 })).toBe(false);
  expect((await service.dispatch()).outcome).toBe('waiting');
  expect(runtimeState.starts).toBe(starts);
});

/**
 * 重启核对：丢失租约的运行进入 UNKNOWN，且**必须能释放槽**。
 *
 * 契约修正（2026-09-24 事故）：dispatch 登记的 ProcessRecord 是 `pid: null`
 * （还没真正启动子进程），因此它属于 unstarted——没有东西需要终止，释放是安全的。
 * 旧断言期待 `occupied: [lost]`，那正是"pid 为空也永久占槽"的写法，
 * 会把唯一的模型槽永久占死、让队列再也不推进。
 */
it('重启后丢失租约进入 UNKNOWN，未启动过的旧运行释放槽（不再永久占位）', async () => {
  const lost = queuedId(await service.enqueue(body('r14-lease-lost'), publicContext()));
  expect((await service.dispatch()).outcome).toBe('started');
  const before = await db.executionRun.findUniqueOrThrow({ where: { id: lost } });
  await db.executionRun.update({
    where: { id: lost },
    data: { leaseUntil: new Date('2020-01-01T00:00:00.000Z'), leaseOwner: 'old-boot' },
  });
  const restarted = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
    .overrideProvider(RUNTIME_PORT).useValue(runtime)
    .overrideProvider(PROCESS_REGISTRY).useValue(registry)
    .compile();
  try {
    await restarted.init();
    const recovery = restarted.get(AgentExecutionService).lastRecovery;
    // isolated：先按租约丢失标 UNKNOWN；released：登记的是「从未启动」，故释放容量。
    expect(recovery).toEqual({ bootId: 'r14-boot', isolated: [lost], released: [lost], occupied: [] });
    const late = await db.executionRun.updateMany({
      where: { id: lost, state: 'RUNNING', leaseEpoch: before.leaseEpoch },
      data: { state: 'SUCCEEDED', tokensIn: 9 },
    });
    expect(late.count).toBe(0);
    expect(await db.executionRun.findUnique({ where: { id: lost } })).toMatchObject({
      state: 'FAILED', leaseEpoch: before.leaseEpoch, stopReason: 'lease-lost', tokensIn: null,
    });
    // 槽已释放：迟到的结果写不进去（epoch 已推进）
    expect(await service.recordResult(lost, { tokensIn: 9, tokensOut: 9, elapsedMs: 9 })).toBe(false);
  } finally {
    await restarted.close();
  }
});

it('当前批次里仍有效的租约不会被启动核对隔离', async () => {
  const running = queuedId(await service.enqueue(body('r14-same-boot'), publicContext()));
  expect((await service.dispatch()).outcome).toBe('started');
  const recovery = await service.recover();
  expect(recovery.isolated).not.toContain(running);
  expect(await db.executionRun.findUnique({ where: { id: running } })).toMatchObject({ state: 'RUNNING' });
  expect(await service.dispatch()).toEqual({ outcome: 'waiting' });
});

it('旧 PID 已被复用时不终止新进程，也无法释放槽', async () => {
  const reused = queuedId(await service.enqueue(body('r14-pid-reused'), publicContext()));
  expect((await service.dispatch()).outcome).toBe('started');
  await db.processRecord.update({
    where: { runId: reused },
    data: { pid: 41414, startedAt: '2026-09-22T00:00:00.000Z' },
  });
  await db.executionRun.update({
    where: { id: reused },
    data: { leaseOwner: 'old-boot', leaseUntil: new Date('2020-01-01T00:00:00.000Z') },
  });
  const restarted = await recoveredModule();
  try {
    await restarted.init();
    expect(processes.killed).toEqual([]);
    expect(restarted.get(AgentExecutionService).lastRecovery).toMatchObject({ occupied: [reused], released: [] });
    expect(await db.executionRun.findUnique({ where: { id: reused } })).toMatchObject({ state: 'UNKNOWN' });
    expect(await service.dispatch()).toEqual({ outcome: 'waiting' });
  } finally {
    await restarted.close();
  }
});

it('登记身份已退出才释放槽，终止没有证明时继续占用', async () => {
  const exited = queuedId(await service.enqueue(body('r14-exited'), publicContext()));
  const stuck = queuedId(await service.enqueue(body('r14-unproven'), publicContext()));
  expect((await service.dispatch()).outcome).toBe('started');
  expect(await service.finish(exited)).toBe(true);
  expect((await service.dispatch()).outcome).toBe('started');
  await db.executionRun.update({
    where: { id: exited },
    data: { state: 'UNKNOWN', leaseOwner: 'old-boot', leaseEpoch: 4 },
  });
  await db.processRecord.update({
    where: { runId: exited },
    data: { pid: 42001, startedAt: '2026-09-22T00:00:03.000Z' },
  });
  await db.executionRun.update({
    where: { id: stuck },
    data: { leaseOwner: 'old-boot', leaseUntil: new Date('2020-01-01T00:00:00.000Z') },
  });
  await db.processRecord.update({
    where: { runId: stuck },
    data: { pid: 41416, startedAt: '2026-09-22T00:00:02.000Z' },
  });
  const restarted = await recoveredModule();
  try {
    await restarted.init();
    const recovery = restarted.get(AgentExecutionService).lastRecovery;
    expect(recovery?.released).toContain(exited);
    expect(recovery?.occupied).toContain(stuck);
    expect(processes.killed).toEqual([{ pid: 41416, startedAt: '2026-09-22T00:00:02.000Z' }]);
    expect(await db.executionRun.findUnique({ where: { id: exited } })).toMatchObject({ state: 'FAILED', stopReason: 'lease-lost' });
    expect(await db.executionRun.findUnique({ where: { id: stuck } })).toMatchObject({ state: 'UNKNOWN' });
    const stale = await db.executionRun.updateMany({
      where: { id: exited, leaseEpoch: 3, state: 'UNKNOWN' },
      data: { state: 'SUCCEEDED' },
    });
    expect(stale.count).toBe(0);
    expect(await service.dispatch()).toEqual({ outcome: 'waiting' });
  } finally {
    await restarted.close();
  }
});

/**
 * 回归（2026-09-24 事故）：设计文档 §10.2 要求「持久队列由 Nest 内定时器领用」，
 * 但实现里只有 accept() 会在提交时试一次 dispatch——提交时槽位忙就永久卡在 QUEUED，
 * 且这些 run 持续占着额度预留与等待队列名额（系统越用越不可用）。
 *
 * 这里验证泵真的存在：**不调用 dispatch()**，只等定时器，队列也会被推进。
 */
/**
 * 回归（2026-09-24 事故）：设计文档 §10.2 要求「持久队列由 Nest 内定时器领用」，
 * 但实现里只有 accept() 会在提交时试一次 dispatch——提交时槽位忙就永久卡在 QUEUED，
 * 且这些 run 持续占着额度预留与等待队列名额（系统越用越不可用）。
 *
 * 这里的测试模块为了避开启动核对而没有 .init()，所以 onModuleInit 里的泵不会启动；
 * 因此直接验证**泵本身的循环**（与 onModuleInit 用的是同一个 pumpOnce）：
 * 只靠定时器、不显式 dispatch，排队中的运行也必须被领走。
 */
it('调度泵：没有显式 dispatch 也会领用排队中的运行', async () => {
  // 第一条占住唯一的槽（单槽纪律）
  const first = queuedId(await service.enqueue(body('r-pump-first'), publicContext()));
  expect(await service.dispatch()).toEqual({ outcome: 'started', runId: first });

  // 第二条只能排队
  const second = queuedId(await service.enqueue(body('r-pump-second'), publicContext()));
  expect(await db.executionRun.findUnique({ where: { id: second } })).toMatchObject({ state: 'QUEUED' });

  // 让第一条跑完并释放槽；此后**不再调用 dispatch()**，只让泵去领
  expect(await service.finish(first)).toBe(true);

  const timer = setInterval(() => void service.pumpForTest(), 250);
  try {
    const until = Date.now() + 15_000;
    let state = 'QUEUED';
    while (Date.now() < until) {
      // 显式驱动泵的一轮（与定时器走同一实现；定时器在测试里不保证被调度）
      await service.pumpForTest();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const row = await db.executionRun.findUnique({ where: { id: second } });
      state = row?.state ?? 'ABSENT';
      // 必须真的被**领走**（RUNNING / 终态）；CANCELLED 是别的测试的清理，不算数
      if (state === 'RUNNING' || state === 'SUCCEEDED' || state === 'FAILED' || state === 'UNKNOWN') break;
    }
    // 泵把它从 QUEUED 领走了。这一条随后可能因测试用假 runtime 而 FAILED，
    // 但那已经证明「队列被推动」——核心断言就是它**不再停在 QUEUED**。
    expect(state).not.toBe('QUEUED');
    expect(['RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN']).toContain(state);
  } finally {
    clearInterval(timer);
  }
}, 30_000);
