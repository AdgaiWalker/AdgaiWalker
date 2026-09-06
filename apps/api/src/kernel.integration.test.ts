import { describe, expect, it, beforeAll } from 'vitest';
import {
  assertPrimaryHasClue,
  isCountableLoop,
  isValidClueBody,
  ruleNextStep,
} from '@walker/shared';
import { IntakeService } from './intake/intake.service';
import { SeedService } from './seed/seed.service';
import { ExecutionService } from './execution/execution.service';
import { ClueService } from './clue/clue.service';
import type { PrismaPort } from './ports/prisma.port';
import { PrismaClient } from '@prisma/client';
import { PrismaClueRepository } from './adapters/prisma-clue.repository';
import { PrismaSeedRepository } from './adapters/prisma-seed.repository';
import { PrismaExecutionRepository } from './adapters/prisma-execution.repository';
import { PrismaGuestQuotaAdapter } from './adapters/prisma-guest-quota.adapter';
import { RuleNextStepAdapter } from './adapters/rule-nextstep.adapter';
import { InMemoryRateLimiter } from './adapters/memory-rate-limit.adapter';
import { PrismaFeatureEventAdapter } from './adapters/prisma-feature-event.adapter';
import { PrismaActionRepository } from './adapters/prisma-action.repository';
import { newId } from './common/ids';

/**
 * 推进核集成测：驱动 shipped Intake/Seed/Execution 用例，不重实现业务。
 * DATABASE_URL 由 vitest.config.ts 强制指向独立测试库。
 */
const url = process.env.DATABASE_URL;

const brief = {
  audience: '想入门 AI 的独立开发者',
  scenario: '选型阶段不知道从哪开始',
  problem: '工具太多无法判断哪个适合自己',
  keyQuestion: '按什么顺序评估 AI 工具？',
  intendedAction: '按清单跑通第一轮选型',
};

describe.runIf(Boolean(url))('推进核集成（真实 PG）', () => {
  let prismaPort: PrismaPort;
  let intake: IntakeService;
  let clues: ClueService;
  let seeds: SeedService;
  let executions: ExecutionService;
  let client: PrismaClient;

  beforeAll(() => {
    client = new PrismaClient({ datasources: { db: { url: url! } } });
    prismaPort = {
      getClient: () => client,
      isWritable: () => true,
      ping: async () => {
        await client.$queryRaw`SELECT 1`;
        return true;
      },
    };
    const clueRepo = new PrismaClueRepository(prismaPort);
    const seedRepo = new PrismaSeedRepository(prismaPort);
    const execRepo = new PrismaExecutionRepository(prismaPort);
    const events = new PrismaFeatureEventAdapter(prismaPort);
    const guest = new PrismaGuestQuotaAdapter(prismaPort);
    const rate = new InMemoryRateLimiter();
    const next = new RuleNextStepAdapter();
    const actionRepo = new PrismaActionRepository(prismaPort);
    intake = new IntakeService(
      prismaPort,
      clueRepo,
      next,
      rate,
      guest,
      events,
    );
    clues = new ClueService(prismaPort, clueRepo, events);
    seeds = new SeedService(prismaPort, seedRepo, clueRepo, execRepo, events, actionRepo);
    executions = new ExecutionService(prismaPort, execRepo, seedRepo, events);
  });

  it('shared 规则：短正文非法；nextStep 非空', () => {
    expect(isValidClueBody('ab')).toBe(false);
    expect(ruleNextStep('想学AI').nextStep.length).toBeGreaterThanOrEqual(4);
  });

  it('无线索主选 → missing-clue', async () => {
    const seed = await seeds.create(`t-${newId().slice(0, 6)}`);
    const clue = await clues.createManual('这是一条仅 candidate 线索正文');
    // 不入池直接 promote（带 brief，才能走到 missing-clue 校验）
    await expect(seeds.promote(seed.id, clue.id, { brief })).rejects.toSatisfy(
      (e: { getResponse?: () => { code?: string } }) =>
        e.getResponse?.()?.code === 'missing-clue',
    );
  });

  it('intake → 入池 → 主选 → 交付 → 检验 形成可计数闭环', async () => {
    const anonId = `anon-${newId()}`;
    const ipKey = `ip-${newId()}`;
    const r = await intake.intake({
      body: '想学 AI 入门从哪开始比较好',
      source: 'tools-visitor',
      anonId,
      ipKey,
    });
    expect(r.nextStep.length).toBeGreaterThanOrEqual(4);
    expect(r.aiUsedFlag).toBe(false);

    await clues.setPoolStatus(r.clueId, 'in-pool');
    const seed = await seeds.create(`闭环-${Date.now()}`);
    await seeds.promote(seed.id, r.clueId, { brief });

    const full = await seeds.list(20);
    const s = full.find((x) => x.id === seed.id)!;
    expect(() => assertPrimaryHasClue(s.links)).not.toThrow();

    const execList = await executions.list(20);
    const ex = execList.find((e) => e.seedId === seed.id);
    expect(ex).toBeTruthy();

    await executions.deliver(ex!.id, {
      url: 'https://iwalk.pro/posts/CC入门',
    });
    const reviewed = await executions.review(ex!.id, { outcome: 'yes' });
    expect(reviewed.countable).toBe(true);

    const s2 = (await seeds.list(50)).find((x) => x.id === seed.id)!;
    const ok = isCountableLoop({
      links: s2.links,
      delivery: { url: 'https://iwalk.pro/posts/CC入门' },
      review: { outcome: 'yes' },
    });
    expect(ok).toBe(true);
  });

  it('游客第二次完整 intake → guest-quota-exceeded', async () => {
    const anonId = `anon-q-${newId()}`;
    const ipKey = `ip-q-${newId()}`;
    await intake.intake({
      body: '第一次完整问答场景描述足够长',
      anonId,
      ipKey,
    });
    await expect(
      intake.intake({
        body: '第二次应被配额拦住的场景描述',
        anonId,
        ipKey: `ip-q2-${newId()}`,
      }),
    ).rejects.toSatisfy(
      (e: { getResponse?: () => { code?: string } }) =>
        e.getResponse?.()?.code === 'guest-quota-exceeded',
    );
  });

  it('并发同游客 intake：配额恰好消费一次，只落一条线索，拒绝不留孤儿', async () => {
    const anonId = `anon-race-${newId()}`;
    const results = await Promise.allSettled([
      intake.intake({ body: '并发场景第一问描述足够长', anonId, ipKey: `ip-r1-${newId()}` }),
      intake.intake({ body: '并发场景第二问描述足够长', anonId, ipKey: `ip-r2-${newId()}` }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const quotaRejected = results.filter(
      (r) =>
        r.status === 'rejected' &&
        (r.reason as { getResponse?: () => { code?: string } })?.getResponse?.()?.code === 'guest-quota-exceeded',
    );
    expect(fulfilled).toHaveLength(1);
    expect(quotaRejected).toHaveLength(1);

    const quotaRow = await client.guestQuota.findUnique({ where: { anonId } });
    expect(quotaRow?.usedCount).toBe(1);
    // 拒绝的那次不留任何线索；成功的那次恰好一条
    expect(await client.clue.count({ where: { anonId } })).toBe(1);

    await expect(
      intake.intake({ body: '第三次同样应被配额拦住', anonId, ipKey: `ip-r3-${newId()}` }),
    ).rejects.toSatisfy(
      (e: { getResponse?: () => { code?: string } }) =>
        e.getResponse?.()?.code === 'guest-quota-exceeded',
    );
    expect(await client.clue.count({ where: { anonId } })).toBe(1);
  });

  it('无存储时写路径 storage-unavailable', async () => {
    const empty: PrismaPort = {
      getClient: () => null,
      isWritable: () => false,
      ping: async () => false,
    };
    const clueRepo = new PrismaClueRepository(empty);
    const events = new PrismaFeatureEventAdapter(empty);
    const svc = new ClueService(empty, clueRepo, events);
    await expect(svc.createManual('足够长的线索正文')).rejects.toSatisfy(
      (e: { getResponse?: () => { code?: string } }) =>
        e.getResponse?.()?.code === 'storage-unavailable',
    );
  });
});

