/**
 * AssistantService 预算熔断单测 — 触顶降级 / 未触顶走 AI / AI 关不计数 / 存储失败放行
 */
import { describe, expect, it, vi } from 'vitest';
import type { AssistantRunResult } from '@walker/shared';
import type { AppConfigPort } from '../config/config.port';
import type {
  AssistantRepositoryPort,
} from '../ports/assistant.repository';
import type { AssistantRunnerPort } from '../ports/assistant-runner.port';
import type { FeatureEventPort } from '../ports/feature-event.port';
import type { RateLimitPort } from '../ports/rate-limit.port';
import { AssistantService } from './assistant.service';

const config = (aiEnabled: boolean): AppConfigPort => ({
  getDatabaseUrl: () => 'file:test.db',
  isAiEnabled: () => aiEnabled,
  getHost: () => '127.0.0.1',
  getPort: () => 8788,
  getNodeEnv: () => 'test',
  getWorkRootDir: () => '/tmp',
  getWorkMaxUploadBytes: () => 1,
});

const aiResult: AssistantRunResult = {
  answer: 'AI 回答。',
  citations: [],
  sessionId: 's-ai',
  aiUsedFlag: true,
  elapsedMs: 100,
};
const ruleResult: AssistantRunResult = {
  answer: '规则兜底回答。',
  citations: [],
  sessionId: 's-rule',
  aiUsedFlag: false,
  elapsedMs: 0,
};

function makeDeps(opts: { bumpReturns?: number; bumpThrows?: boolean } = {}) {
  const runner: AssistantRunnerPort = { ask: vi.fn(async () => aiResult) };
  const fallback: AssistantRunnerPort = { ask: vi.fn(async () => ruleResult) };
  const events: FeatureEventPort = {
    record: vi.fn(async () => {}),
    listRecent: vi.fn(async () => []),
    aggregate: vi.fn(async () => ({
      byFeature: {},
      failCodes: {},
    })),
  };
  const repo: AssistantRepositoryPort = {
    upsertSession: vi.fn(async () => {}),
    saveRun: vi.fn(async () => {}),
    listRuns: vi.fn(async () => []),
    bumpRequests: vi.fn(async () => {
      if (opts.bumpThrows) throw new Error('storage down');
      return opts.bumpReturns ?? 1;
    }),
  };
  const rateLimit: RateLimitPort = { consume: () => true };
  return { runner, fallback, events, repo, rateLimit };
}

function serviceFor(
  aiEnabled: boolean,
  deps: ReturnType<typeof makeDeps>,
  limit = 200,
) {
  process.env.ASSISTANT_DAILY_LIMIT = String(limit);
  try {
    return new AssistantService(
      config(aiEnabled),
      deps.runner,
      deps.fallback as never, // RuleAssistantAdapter 与端口同构
      deps.repo,
      deps.rateLimit,
      deps.events,
    );
  } finally {
    delete process.env.ASSISTANT_DAILY_LIMIT;
  }
}

const ask = { body: '正常长度的问题', anonId: 'anon-1', ipKey: 'ip-1' };

describe('AssistantService 每日预算熔断', () => {
  it('AI 开 + 未触顶：走 runner（AI），预算 +1，落库', async () => {
    const d = makeDeps({ bumpReturns: 5 });
    const r = await serviceFor(true, d).ask(ask);
    expect(r.aiUsedFlag).toBe(true);
    expect(d.runner.ask).toHaveBeenCalledTimes(1);
    expect(d.fallback.ask).not.toHaveBeenCalled();
    expect(d.repo.bumpRequests).toHaveBeenCalledTimes(1);
    expect(d.repo.saveRun).toHaveBeenCalledTimes(1);
  });

  it('AI 开 + 触顶：直接规则兜底，不调 runner，记 budget-exceeded fail 事件', async () => {
    const d = makeDeps({ bumpReturns: 201 });
    const r = await serviceFor(true, d, 200).ask(ask);
    expect(r.aiUsedFlag).toBe(false);
    expect(r.answer).toBe('规则兜底回答。');
    expect(d.runner.ask).not.toHaveBeenCalled();
    expect(d.fallback.ask).toHaveBeenCalledTimes(1);
    const calls = (d.events.record as ReturnType<typeof vi.fn>).mock.calls;
    expect(
      calls.some((c) => (c[0] as { failCode?: string }).failCode === 'budget-exceeded'),
    ).toBe(true);
    // 触顶的回答仍然落库（问题池价值）
    expect(d.repo.saveRun).toHaveBeenCalledTimes(1);
  });

  it('AI 关：不消耗预算计数（不调 bumpRequests）', async () => {
    const d = makeDeps();
    const r = await serviceFor(false, d).ask(ask);
    expect(r).toBeTruthy();
    expect(d.repo.bumpRequests).not.toHaveBeenCalled();
    expect(d.runner.ask).toHaveBeenCalledTimes(1);
  });

  it('预算存储失败：fail-open 照常走 AI，不阻断', async () => {
    const d = makeDeps({ bumpThrows: true });
    const r = await serviceFor(true, d).ask(ask);
    expect(r.aiUsedFlag).toBe(true);
    expect(d.runner.ask).toHaveBeenCalledTimes(1);
  });

  it('2 字中文放行（对话语境，与卡口 4 字规则解耦）', async () => {
    const d = makeDeps();
    const r = await serviceFor(true, d).ask({ ...ask, body: '你好' });
    expect(d.runner.ask).toHaveBeenCalledTimes(1);
    expect(r.answer).toBe('AI 回答。');
  });

  it('1 字仍拒收', async () => {
    const d = makeDeps();
    await expect(
      serviceFor(true, d).ask({ ...ask, body: '好' }),
    ).rejects.toSatisfy((e: { message?: string }) =>
      String(e.message).includes('assistant-body-too-short'),
    );
    expect(d.runner.ask).not.toHaveBeenCalled();
  });

  it('触顶当日按 UTC+8 日期键计数（跨日自然重置）', async () => {
    const dates: string[] = [];
    const d = makeDeps();
    (d.repo.bumpRequests as ReturnType<typeof vi.fn>).mockImplementation(
      async (date: string) => {
        dates.push(date);
        return 1;
      },
    );
    await serviceFor(true, d).ask(ask);
    expect(dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
