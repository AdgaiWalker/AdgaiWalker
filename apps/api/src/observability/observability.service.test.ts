/**
 * ObservabilityService 单测 — 三标签聚合口径 + 空库不炸 + 匿名红线。
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { FeatureEventPort } from '../ports/feature-event.port';
import type { PrismaPort } from '../ports/prisma.port';
import { ObservabilityService, isoWeekKey } from './observability.service';

type FakeClient = {
  featureEvent?: { findMany: ReturnType<typeof vi.fn> };
  assistantRun?: { findMany: ReturnType<typeof vi.fn> };
  assistantBudget?: { findMany: ReturnType<typeof vi.fn> };
  clue?: { findMany: ReturnType<typeof vi.fn> };
  assistantSession?: { findMany: ReturnType<typeof vi.fn> };
  searchMiss?: { findMany: ReturnType<typeof vi.fn> };
  contentFeedback?: { findMany: ReturnType<typeof vi.fn> };
};

function eventPort(
  record = vi.fn(async (_input: { id: string }) => {}),
): FeatureEventPort {
  return {
    record,
    listRecent: vi.fn(async () => []),
    aggregate: vi.fn(async () => ({ byFeature: {}, failCodes: {} })),
  };
}

function serviceFor(
  client: FakeClient | null,
  events: FeatureEventPort = eventPort(),
): ObservabilityService {
  const prisma: PrismaPort = {
    getClient: () => client as unknown as PrismaClient | null,
    isWritable: () => client !== null,
    ping: async () => true,
  };
  return new ObservabilityService(prisma, events);
}

describe('isoWeekKey', () => {
  it('同周同键、跨周不同、格式稳定', () => {
    const monday = new Date('2026-09-14T00:00:00Z');
    const sunday = new Date('2026-09-20T23:00:00Z');
    const nextMonday = new Date('2026-09-21T00:00:00Z');

    expect(isoWeekKey(monday)).toMatch(/^\d{4}-W\d{2}$/);
    expect(isoWeekKey(monday)).toBe(isoWeekKey(sunday));
    expect(isoWeekKey(monday)).not.toBe(isoWeekKey(nextMonday));
  });
});

describe('usageStats（标签一）', () => {
  it('guest / owner 分列；expose 不进三列', async () => {
    const svc = serviceFor({
      featureEvent: {
        findMany: vi.fn(async () => [
          {
            at: new Date('2026-09-14T01:00:00Z'),
            featureKey: 'assistant.ask',
            event: 'attempt',
            actorType: 'guest',
          },
          {
            at: new Date('2026-09-14T01:00:01Z'),
            featureKey: 'assistant.ask',
            event: 'success',
            actorType: 'guest',
          },
          {
            at: new Date('2026-09-14T02:00:00Z'),
            featureKey: 'assistant.ask',
            event: 'fail',
            actorType: 'owner',
          },
          {
            at: new Date('2026-09-14T03:00:00Z'),
            featureKey: 'clue.create',
            event: 'expose',
            actorType: 'guest',
          },
        ]),
      },
    });

    const view = await svc.usageStats(30);

    expect(view.days).toBe(30);
    expect(view.weeks).toHaveLength(1);
    expect(view.byFeature['assistant.ask'].guest).toEqual({
      attempt: 1,
      success: 1,
      fail: 0,
    });
    expect(view.byFeature['assistant.ask'].owner).toEqual({
      attempt: 0,
      success: 0,
      fail: 1,
    });
    // 只有 expose 的特征不建行
    expect(view.byFeature['clue.create']).toBeUndefined();
  });
});

describe('aiStats（标签二）', () => {
  it('空库返回零值结构，不炸', async () => {
    const svc = serviceFor({
      assistantRun: { findMany: vi.fn(async () => []) },
      assistantBudget: { findMany: vi.fn(async () => []) },
    });

    const view = await svc.aiStats(30);

    expect(view).toMatchObject({
      days: 30,
      totalRuns: 0,
      aiRuns: 0,
      aiRatio: 0,
      tokensIn: 0,
      tokensOut: 0,
      cacheReadTokens: 0,
      degradeReasons: [],
      dailyBudget: [],
      elapsedMs: { p50: 0, p90: 0 },
      firstChunkMs: { p50: 0, p90: 0 },
    });
  });

  it('AI 占比 / 降级直方图 / token 汇总 / 分位 / 预算窗口过滤', async () => {
    const svc = serviceFor({
      assistantRun: {
        findMany: vi.fn(async () => [
          {
            aiUsedFlag: true,
            elapsedMs: 100,
            firstChunkMs: 50,
            tokensIn: 100,
            tokensOut: 20,
            cacheReadTokens: 60,
            degradeReason: null,
          },
          {
            aiUsedFlag: false,
            elapsedMs: 300,
            firstChunkMs: null,
            tokensIn: 0,
            tokensOut: 0,
            cacheReadTokens: 0,
            degradeReason: 'timeout',
          },
          {
            aiUsedFlag: false,
            elapsedMs: 200,
            firstChunkMs: null,
            tokensIn: 0,
            tokensOut: 0,
            cacheReadTokens: 0,
            degradeReason: 'timeout',
          },
          {
            aiUsedFlag: false,
            elapsedMs: 400,
            firstChunkMs: null,
            tokensIn: 0,
            tokensOut: 0,
            cacheReadTokens: 0,
            degradeReason: 'ai-disabled',
          },
        ]),
      },
      assistantBudget: {
        findMany: vi.fn(async () => [
          { date: '2000-01-01', requests: 3, tokensIn: 100, tokensOut: 20 },
        ]),
      },
    });

    const view = await svc.aiStats(30);

    expect(view.totalRuns).toBe(4);
    expect(view.aiRuns).toBe(1);
    expect(view.aiRatio).toBe(0.25);
    expect(view.tokensIn).toBe(100);
    expect(view.tokensOut).toBe(20);
    expect(view.cacheReadTokens).toBe(60);
    expect(view.degradeReasons).toEqual([
      { reason: 'timeout', count: 2 },
      { reason: 'ai-disabled', count: 1 },
    ]);
    expect(view.elapsedMs).toEqual({ p50: 200, p90: 400 });
    expect(view.firstChunkMs).toEqual({ p50: 50, p90: 50 });
    // 窗口外的日期不并入
    expect(view.dailyBudget).toHaveLength(0);
  });

  it('预算行只并入窗口内日期', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const svc = serviceFor({
      assistantRun: { findMany: vi.fn(async () => []) },
      assistantBudget: {
        findMany: vi.fn(async () => [
          { date: today, requests: 2, tokensIn: 10, tokensOut: 5 },
          { date: '2000-01-01', requests: 9, tokensIn: 90, tokensOut: 90 },
        ]),
      },
    });

    const view = await svc.aiStats(30);

    expect(view.dailyBudget).toEqual([
      { date: today, requests: 2, tokensIn: 10, tokensOut: 5 },
    ]);
  });
});

describe('journey（标签三）', () => {
  it('anonId 模式：只回该访客两源，时间升序，其余两源不查', async () => {
    const searchFind = vi.fn(async () => []);
    const feedbackFind = vi.fn(async () => []);
    const svc = serviceFor({
      clue: {
        findMany: vi.fn(async () => [
          {
            body: '我卡在选题',
            source: 'tools-visitor',
            createdAt: new Date('2026-09-14T02:00:00Z'),
          },
        ]),
      },
      assistantSession: { findMany: vi.fn(async () => [{ sessionId: 's1' }]) },
      assistantRun: {
        findMany: vi.fn(async () => [
          { question: '怎么开始', createdAt: new Date('2026-09-14T01:00:00Z') },
        ]),
      },
      searchMiss: { findMany: searchFind },
      contentFeedback: { findMany: feedbackFind },
    });

    const events = await svc.journey(7, 'anon-1');

    expect(events.map((e) => e.source)).toEqual(['assistant', 'clue']);
    expect(events.map((e) => e.actor)).toEqual(['guest', 'guest']);
    expect(searchFind).not.toHaveBeenCalled();
    expect(feedbackFind).not.toHaveBeenCalled();
  });

  it('窗口模式：四源齐且有序，无匿名键的两源标 anonymous，自记线索标 owner', async () => {
    const svc = serviceFor({
      clue: {
        findMany: vi.fn(async () => [
          {
            body: '自记线索',
            source: 'manual-self',
            createdAt: new Date('2026-09-14T01:00:00Z'),
          },
        ]),
      },
      assistantSession: { findMany: vi.fn(async () => []) },
      assistantRun: {
        findMany: vi.fn(async () => [
          { question: '访客问题', createdAt: new Date('2026-09-14T03:00:00Z') },
        ]),
      },
      searchMiss: {
        findMany: vi.fn(async () => [
          { query: '没用关键词', createdAt: new Date('2026-09-14T02:00:00Z') },
        ]),
      },
      contentFeedback: {
        findMany: vi.fn(async () => [
          {
            contentId: 'c1',
            signal: 'useful',
            createdAt: new Date('2026-09-14T04:00:00Z'),
          },
        ]),
      },
    });

    const events = await svc.journey(7);

    expect(events.map((e) => e.source)).toEqual([
      'clue',
      'search-miss',
      'assistant',
      'content-feedback',
    ]);
    expect(events.map((e) => e.actor)).toEqual([
      'owner',
      'anonymous',
      'guest',
      'anonymous',
    ]);
  });
});

describe('无存储', () => {
  it('查询与写入都不静默：查询返回零值，写入如实报 storage-unavailable', async () => {
    const svc = serviceFor(null);

    expect(await svc.usageStats(30)).toEqual({
      days: 30,
      weeks: [],
      byFeature: {},
    });
    expect((await svc.aiStats(30)).totalRuns).toBe(0);
    expect(await svc.journey(7)).toEqual([]);
    await expect(
      svc.recordEvent({
        featureKey: 'agent.mcp',
        event: 'attempt',
        actorType: 'owner',
      }),
    ).rejects.toSatisfy((e: { message?: string }) =>
      String(e.message).includes('storage-unavailable'),
    );
  });
});

describe('recordEvent（外部 agent 观测回写）', () => {
  it('写入 FeatureEvent：带 id、登记键、事件类型与 props', async () => {
    const record = vi.fn(async (_input: { id: string }) => {});
    const svc = serviceFor({}, eventPort(record));

    await expect(
      svc.recordEvent({
        featureKey: 'agent.mcp',
        event: 'success',
        actorType: 'owner',
        props: { tool: 'search_judgment' },
      }),
    ).resolves.toEqual({ recorded: true });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        featureKey: 'agent.mcp',
        event: 'success',
        actorType: 'owner',
        failCode: null,
        props: { tool: 'search_judgment' },
      }),
    );
    expect(record.mock.calls[0]![0].id.length).toBeGreaterThan(0);
  });
});
