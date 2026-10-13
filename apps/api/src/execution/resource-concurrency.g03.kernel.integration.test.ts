import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import { memoryHeadroomOk, MODEL_SLOT_LIMIT, PUBLIC_QUEUE_LIMIT, READ_ONLY_PROFILE, SLOT_OCCUPYING_STATES } from '@walker/shared';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { PROCESS_REGISTRY, type ProcessRegistryPort } from '../ports/process-registry.port';
import { RUNTIME_PORT, type RuntimePort } from '../ports/runtime.port';
import { SITE_CONTENT_INDEX } from '../ports/site-content-index.port';
import { AuthorizationService } from '../authorization/authorization.service';
import { PublicReadinessService } from '../deployments/public-readiness.service';
import { DeploymentService } from '../deployments/deployment.service';
import { AgentExecutionService, type ExecutionContext } from './agent-execution.service';

const TAG = 'g03-';
const agentId = `${TAG}agent`;
const revisionId = `${TAG}revision`;
const visitor = `${TAG}visitor`;
const owner = `${TAG}owner`;

/**
 * 受控运行时：
 * - start 立即完成（领取与启动分离，不阻塞 dispatch）；
 * - run 挂起表示长运行（持续占用槽位），releaseRun() 释放；
 * - close 记录关闭证据并返回退出成功。
 */
const runtimeState: {
  starts: number;
  runs: number;
  closes: number;
  runHold: Promise<void> | null;
  runRelease: (() => void) | null;
} = { starts: 0, runs: 0, closes: 0, runHold: null, runRelease: null };

function holdRun(): void {
  runtimeState.runHold = new Promise<void>((resolve) => { runtimeState.runRelease = resolve; });
}
function releaseRun(): void {
  runtimeState.runRelease?.();
  runtimeState.runRelease = null;
  runtimeState.runHold = null;
}

const runtime: RuntimePort = {
  async start() {
    runtimeState.starts += 1;
  },
  async run() {
    runtimeState.runs += 1;
    if (runtimeState.runHold) await runtimeState.runHold;
    throw new Error('g03-run-held-then-failed');
  },
  observe() { return () => undefined; },
  async close() {
    runtimeState.closes += 1;
    return { exited: true };
  },
};

const registry: ProcessRegistryPort = {
  async currentBatch() { return { bootId: `${TAG}boot`, pid: process.pid }; },
  async inspect(record) {
    if (!record || record.pid === null || record.startedAt === null) return 'unstarted';
    return 'exited';
  },
  async terminate() { return 'exited'; },
};

let moduleRef: TestingModule;
let db: PrismaClient;
let service: AgentExecutionService;
let auth: AuthorizationService;
let grantSeq = 0;

function adminContext(grantId: string): ExecutionContext {
  return { origin: 'admin', principalType: 'owner', principalId: owner, agentId, grantId };
}
function body(requestKey: string) {
  return { requestKey, kind: 'chat' as const, agentRevisionId: revisionId, input: `G03 排队 ${requestKey}` };
}
async function submitAdmin(requestKey: string, grantId: string): Promise<string> {
  const result = await service.enqueue(body(requestKey), adminContext(grantId));
  if (result.outcome !== 'queued') throw new Error(result.reason);
  return result.runId;
}
function issue(runLimit: number) {
  grantSeq += 1;
  return auth.issue({
    requestKey: `${TAG}grant-${String(grantSeq).padStart(4, '0')}`, level: 'L0', agentId,
    actions: ['agent:run'], resourceScope: { kind: 'agent', ids: [agentId] },
    expiresAt: '2099-01-01T00:00:00.000Z', runLimit, usageLimit: 1000,
  }, owner);
}

describe('G03 目标机器资源和并发验收（单槽/排队/终止/恢复/内存门禁）', () => {
  beforeAll(async () => {
    vi.stubEnv('AI_ENABLED', 'false');
    moduleRef = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
      .overrideProvider(RUNTIME_PORT).useValue(runtime)
      .overrideProvider(PROCESS_REGISTRY).useValue(registry)
      .overrideProvider(SITE_CONTENT_INDEX).useValue({
        loadCitable: async () => [{ slug: 'post-a', title: '文章 A', summary: '', tags: [], actionable: false }],
        loadCitableFull: async () => [{ slug: 'post-a', title: '文章 A', summary: '', tags: [], actionable: false, body: '公开正文' }],
        loadCitableSnapshot: async () => ({ buildId: 'g03-build', collectionHash: 'a'.repeat(64), entries: [{ slug: 'post-a', title: '文章 A', summary: '', tags: [], actionable: false, body: '公开正文' }] }),
      })
      .compile();
    db = moduleRef.get<PrismaPort>(PRISMA).getClient()!;
    service = moduleRef.get(AgentExecutionService);
    auth = moduleRef.get(AuthorizationService);

    await db.agentUnit.create({ data: { id: agentId, name: 'G03 资源验收', prompt: '只读' } });
    await db.agentRevision.create({
      data: {
        id: revisionId, agentId, version: 1, prompt: '只读', modelId: 'deepseek-chat',
        toolProfile: READ_ONLY_PROFILE, schemaVersion: 1, configHash: 'a'.repeat(64),
      },
    });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    // 先删子记录（事件/进程/额度/日志登记）再删运行本体，避免外键约束
    const g03RunIds = (await db.executionRun.findMany({
      where: { OR: [{ actor: visitor }, { actor: owner }, { id: { startsWith: TAG } }] },
      select: { id: true },
    })).map((row) => row.id);
    if (g03RunIds.length > 0) {
      await db.executionEvent.deleteMany({ where: { runId: { in: g03RunIds } } });
      await db.processRecord.deleteMany({ where: { runId: { in: g03RunIds } } });
      await db.executionQuotaHold.deleteMany({ where: { runId: { in: g03RunIds } } });
      await db.conversationLogResource.deleteMany({ where: { OR: [{ resourceType: 'execution-run', resourceKey: { in: g03RunIds } }, { resourceType: 'execution-event', parentKey: { in: g03RunIds } }] } });
    }
    await db.executionRun.deleteMany({ where: { OR: [{ actor: visitor }, { actor: owner }, { id: { startsWith: TAG } }] } });
    await db.authorizationGrant.deleteMany({ where: { principalId: owner, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
    await db.auditRecord.deleteMany({ where: { OR: [{ targetId: agentId }, { targetId: { startsWith: TAG } }] } });
    await db.agentRevision.deleteMany({ where: { agentId } });
    await db.agentUnit.deleteMany({ where: { id: agentId } });
    await db.executionSchedule.deleteMany({ where: { id: 'global' } });
    await moduleRef.close();
  });

  beforeEach(async () => {
    releaseRun();
    runtimeState.starts = 0;
    runtimeState.runs = 0;
    runtimeState.closes = 0;
    await db.executionRun.updateMany({
      where: { OR: [{ actor: visitor }, { actor: owner }], state: { notIn: ['SUCCEEDED', 'FAILED', 'CANCELLED'] } },
      data: { state: 'CANCELLED', leaseOwner: null, leaseUntil: null },
    });
    await db.executionSchedule.upsert({
      where: { id: 'global' }, create: { id: 'global', consecutivePublicClaims: 0 }, update: { consecutivePublicClaims: 0 },
    });
  });

  it('单槽纪律：第一条运行占用槽位后，第二条领取被挡（不偷偷双开）', async () => {
    // 让 start 挂起：第一条运行保持 RUNNING 占槽
    holdRun();

    const grant1 = await issue(5);
    const first = await submitAdmin(`${TAG}rk-slot-1`, grant1.id);

    // 手动推泵：第一条应被领取并启动
    await service.pumpForTest();
    const firstRow = await db.executionRun.findUnique({ where: { id: first } });
    expect(firstRow!.state).toBe('RUNNING');
    expect(runtimeState.starts).toBe(1);

    // 第二条提交后推泵：槽位被占，必须保持 QUEUED，绝不第二个 start
    const grant2 = await issue(5);
    const second = await submitAdmin(`${TAG}rk-slot-2`, grant2.id);
    await service.pumpForTest();
    const secondRow = await db.executionRun.findUnique({ where: { id: second } });
    expect(secondRow!.state).toBe('QUEUED');
    expect(runtimeState.starts).toBe(1); // 仍然只有一次启动
    expect(MODEL_SLOT_LIMIT).toBe(1); // 阈值本身固定为单槽

    // 先提交停止，再释放假 runtime 的挂起结果；反过来会让结果抢先进入终态。
    const stopped = await service.stop(first, 'user');
    releaseRun();
    expect(stopped.outcome).toBe('stopped');
    expect(runtimeState.closes).toBe(1);
    // 槽释放后第二条可被领取
    holdRun();
    await service.pumpForTest();
    const secondAfter = await db.executionRun.findUnique({ where: { id: second } });
    expect(secondAfter!.state).toBe('RUNNING');
    await service.stop(second, 'user');
    releaseRun();
  });

  it('公共排队上限：超过 PUBLIC_QUEUE_LIMIT 的新提交被如实降级', async () => {
    holdRun();

    // 占槽：一条 RUNNING
    const grant0 = await issue(50);
    const occupying = await submitAdmin(`${TAG}rk-q-0`, grant0.id);
    await service.pumpForTest();

    // 公共排队塞满：PUBLIC_QUEUE_LIMIT 条 public chat
    const queuedIds: string[] = [];
    for (let i = 1; i <= PUBLIC_QUEUE_LIMIT; i += 1) {
      const result = await service.enqueue(
        { requestKey: `${TAG}rk-q-${i}`, kind: 'chat', agentRevisionId: revisionId, input: `公共排队 ${i}`, targetId: 'post-a' },
        { origin: 'public', principalType: 'visitor', principalId: visitor, agentId, grantId: null, placementKey: 'post-detail', deploymentId: 'g03-deploy', deploymentGeneration: 1, contentSnapshotId: 'b'.repeat(64) },
      );
      expect(result.outcome).toBe('queued');
      if (result.outcome === 'queued') queuedIds.push(result.runId);
    }
    expect(queuedIds.length).toBe(PUBLIC_QUEUE_LIMIT);

    // 第 PUBLIC_QUEUE_LIMIT+1 条必须被拒（降级为规则处理，不假装排队成功）
    const overflow = await service.enqueue(
      { requestKey: `${TAG}rk-q-overflow`, kind: 'chat', agentRevisionId: revisionId, input: '溢出', targetId: 'post-a' },
      { origin: 'public', principalType: 'visitor', principalId: visitor, agentId, grantId: null, placementKey: 'post-detail', deploymentId: 'g03-deploy', deploymentGeneration: 1, contentSnapshotId: 'b'.repeat(64) },
    );
    expect(overflow.outcome).not.toBe('queued');
    if (overflow.outcome !== 'queued') expect(overflow.reason).toContain('已满');

    // 清理：取消全部排队 + 停止占槽运行
    for (const id of queuedIds) await service.stop(id, 'user');
    releaseRun();
    await service.stop(occupying, 'user');
  });

  it('终止语义：RUNNING 停止走 STOPPING→CANCELLED，进程关闭有证据，槽立即释放', async () => {
    holdRun();

    const grant = await issue(5);
    const run = await submitAdmin(`${TAG}rk-stop`, grant.id);
    await service.pumpForTest();
    expect((await db.executionRun.findUnique({ where: { id: run } }))!.state).toBe('RUNNING');

    const stopped = await service.stop(run, 'user');
    expect(stopped.outcome).toBe('stopped');
    if (stopped.outcome === 'stopped') expect(stopped.state).toBe('CANCELLED');

    // 关闭证据：runtime.close 被真实调用且报告退出
    expect(runtimeState.closes).toBe(1);

    // 槽立即释放：下一条可领取
    const grant2 = await issue(5);
    const next = await submitAdmin(`${TAG}rk-stop-2`, grant2.id);
    await service.pumpForTest();
    expect((await db.executionRun.findUnique({ where: { id: next } }))!.state).toBe('RUNNING');
    await service.stop(next, 'user');
    
  });

  it('恢复语义：重启后遗留的 RUNNING（租约丢失）先标 UNKNOWN，退出被证明才释放槽', async () => {
    // 直接落一条"上个批次遗留"的 RUNNING（模拟崩溃后重启）
    const staleId = `${TAG}stale-run`;
    await db.executionRun.create({
      data: {
        id: staleId, kind: 'chat', origin: 'admin', actor: 'owner', actorScope: 'legacy:admin',
        requestKey: `${TAG}rk-stale`, inputHash: 'h'.repeat(64), input: '遗留运行',
        state: 'RUNNING', leaseOwner: `${TAG}boot-OLD`, leaseEpoch: 1,
        leaseUntil: new Date(Date.now() - 60_000),
      },
    });

    // 恢复：租约不属于当前批次 → 先标 UNKNOWN；同一轮内进程退出被证明（unstarted 可释放）→ FAILED
    const recovery = await service.recover();
    expect(recovery.isolated).toContain(staleId); // 被隔离标记过
    expect(recovery.released).toContain(staleId); // 退出被证明后释放

    const afterRecovery = await db.executionRun.findUnique({ where: { id: staleId } });
    expect(afterRecovery!.state).toBe('FAILED'); // 最终 FAILED，槽释放
    expect(afterRecovery!.stopReason).toBe('lease-lost');
    expect(SLOT_OCCUPYING_STATES).toContain('UNKNOWN'); // UNKNOWN 仍在占用集合（其他未证明的场景继续占槽）
  });



  it('资源门禁（readiness）：余量不足时该能力被阻止上线，满足时放行', async () => {
    // vitest 配置默认解除了门（WALKER_MEMORY_HEADROOM_MB=0）；此处临时恢复默认 512 验证真实行为
    const saved = process.env.WALKER_MEMORY_HEADROOM_MB;
    process.env.WALKER_MEMORY_HEADROOM_MB = '';
    try {
      const readiness = moduleRef.get(PublicReadinessService);
      const deployments = moduleRef.get(DeploymentService);
      const list = await deployments.list().catch(() => []);
      if (list.length > 0) {
        const report = await readiness.inspect(list[0]!.id);
        const gate = report.gates.find((g) => g.key === 'resourceHeadroom');
        expect(gate).toBeDefined();
        // 状态与真实内存严格一致：不满足即 blocked，绝不含糊
        const realFree = memoryHeadroomOk(os.freemem());
        expect(gate!.state).toBe(realFree.ok ? 'ready' : 'blocked');
      }
      // 纯函数双侧验证（gate 内用的正是它）
      const low = memoryHeadroomOk(100 * 1024 * 1024);
      expect(low.ok).toBe(false);
      if (!low.ok) expect(low.reason).toContain('512MB');
      const high = memoryHeadroomOk(2 * 1024 * 1024 * 1024);
      expect(high.ok).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.WALKER_MEMORY_HEADROOM_MB;
      else process.env.WALKER_MEMORY_HEADROOM_MB = saved;
    }
  });

  it('无孤儿进程：全部运行进入终态后，占用槽位数为 0', async () => {
    // 造几条不同来源的运行并全部收敛到终态
    const grant = await issue(5);
    const a = await submitAdmin(`${TAG}rk-final-a`, grant.id);
    await service.pumpForTest();
    await service.stop(a, 'user');
    const b = await submitAdmin(`${TAG}rk-final-b`, grant.id);
    await service.pumpForTest();
    await service.stop(b, 'user');

    const occupying = await db.executionRun.count({ where: { state: { in: [...SLOT_OCCUPYING_STATES] } } });
    expect(occupying).toBe(0);
  });
});
