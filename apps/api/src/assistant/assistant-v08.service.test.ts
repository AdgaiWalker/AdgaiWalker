/**
 * V08 单测：会话归属（服务端 hash）、每匿名限流、requestKey 幂等、伪造 grant 无效。
 */
import { describe, expect, it, vi } from 'vitest';
import type { AssistantRunResult } from '@walker/shared';
import { hashAnonId } from '../auth/anon-cookie';
import type { AppConfigPort } from '../config/config.port';
import type { AssistantRepositoryPort, AssistantRunRecord } from '../ports/assistant.repository';
import type { AssistantRunnerPort } from '../ports/assistant-runner.port';
import type { FeatureEventPort } from '../ports/feature-event.port';
import type { RateLimitPort } from '../ports/rate-limit.port';
import { AssistantService } from './assistant.service';

const config = (): AppConfigPort => ({
  getDatabaseUrl: () => 'file:test.db',
  isAiEnabled: () => true,
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

const priorRun: AssistantRunRecord = {
  id: 'run-prior',
  sessionId: 's-prior',
  question: '同一个问题',
  answer: '已回答过的内容',
  citations: ['a-post'],
  aiUsedFlag: true,
  elapsedMs: 90,
  source: 'assistant-panel',
  createdAt: '2026-09-22T00:00:00.000Z',
};

function makeDeps(opts: {
  sessionOwner?: { anonId: string; runner: string } | null;
  prior?: AssistantRunRecord | null;
  anonLimitOk?: boolean;
} = {}) {
  const runner: AssistantRunnerPort = { ask: vi.fn(async () => aiResult) };
  const fallback: AssistantRunnerPort = { ask: vi.fn(async () => ({ ...aiResult, aiUsedFlag: false })) };
  const events: FeatureEventPort = {
    record: vi.fn(async () => {}),
    listRecent: vi.fn(async () => []),
    aggregate: vi.fn(async () => ({ byFeature: {}, failCodes: {} })),
  };
  const repo: AssistantRepositoryPort = {
    upsertSession: vi.fn(async () => {}),
    findSession: vi.fn(async () => opts.sessionOwner ?? null),
    saveRun: vi.fn(async () => {}),
    listRuns: vi.fn(async () => []),
    findRunByRequest: vi.fn(async () => opts.prior ?? null),
    bumpRequests: vi.fn(async () => 1),
    addTokens: vi.fn(async () => {}),
  };
  const consumed: string[] = [];
  const rateLimit: RateLimitPort = {
    consume: (key: string) => {
      consumed.push(key);
      if (key.startsWith('assistant:anon:')) return opts.anonLimitOk ?? true;
      return true;
    },
  };
  const service = new AssistantService(config(), runner, fallback as never, repo, rateLimit, events);
  return { service, runner, repo, consumed };
}

const baseInput = { body: '这是一个问题', anonId: 'a'.repeat(64), ipKey: 'ip-1', isAuthenticated: false };

describe('AssistantService V08', () => {
  it('会话归属按服务端 hash 比较：登记 hash 一致的会话可续轮，他人会话降级为新会话', async () => {
    const mine = makeDeps({ sessionOwner: { anonId: hashAnonId(baseInput.anonId), runner: 'harness' } });
    await mine.service.ask({ ...baseInput, sessionId: 's-mine' });
    expect((mine.runner.ask as ReturnType<typeof vi.fn>).mock.calls[0]![0].sessionId).toBe('s-mine');

    const other = makeDeps({ sessionOwner: { anonId: hashAnonId('b'.repeat(64)), runner: 'harness' } });
    await other.service.ask({ ...baseInput, sessionId: 's-other' });
    expect((other.runner.ask as ReturnType<typeof vi.fn>).mock.calls[0]![0].sessionId).toBeNull();
  });

  it('会话落库存 hash 不存明文；每匿名身份有独立限流键', async () => {
    const deps = makeDeps();
    await deps.service.ask(baseInput);
    const upsert = (deps.repo.upsertSession as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(upsert.anonId).toBe(hashAnonId(baseInput.anonId));
    expect(upsert.anonId).not.toBe(baseInput.anonId);
    const saved = (deps.repo.saveRun as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(saved.anonIdHash).toBe(hashAnonId(baseInput.anonId));
    expect(deps.consumed.some((key) => key.startsWith('assistant:anon:'))).toBe(true);
  });

  it('每匿名限流触顶即 429，伪造新身份也受各自上限约束', async () => {
    const deps = makeDeps({ anonLimitOk: false });
    await expect(deps.service.ask(baseInput)).rejects.toMatchObject({ status: 429 });
    expect((deps.runner.ask as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('重复 requestKey 返回原 run：不重新调用模型、不再写库、不重复计预算', async () => {
    const deps = makeDeps({ prior: priorRun });
    const result = await deps.service.ask({ ...baseInput, requestKey: 'rk-12345678' });
    expect(result.answer).toBe('已回答过的内容');
    expect(result.sessionId).toBe('s-prior');
    expect(result.citations).toEqual([{ slug: 'a-post' }]);
    expect((deps.runner.ask as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    expect((deps.repo.saveRun as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    expect((deps.repo.bumpRequests as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('并发相同 requestKey 只执行一次模型，流式重试收到同一答案', async () => {
    const deps = makeDeps();
    let finish!: (value: AssistantRunResult) => void;
    (deps.runner.ask as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise<AssistantRunResult>((resolve) => { finish = resolve; }));
    const input = { ...baseInput, requestKey: 'rk-concurrent-1' };
    const first = deps.service.ask(input);
    const replayed: string[] = [];
    const second = deps.service.askStream(input, (delta) => replayed.push(delta));
    await vi.waitFor(() => expect((deps.runner.ask as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1));
    finish(aiResult);
    const [a, b] = await Promise.all([first, second]);
    expect(b).toEqual(a);
    expect(replayed).toEqual([aiResult.answer]);
    expect((deps.repo.saveRun as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('requestKey 形状非法 400；首次请求落库带 requestKey 供幂等', async () => {
    const deps = makeDeps();
    await expect(deps.service.ask({ ...baseInput, requestKey: 'bad' })).rejects.toMatchObject({ status: 400 });

    await deps.service.ask({ ...baseInput, requestKey: 'rk-12345678' });
    const saved = (deps.repo.saveRun as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(saved.requestKey).toBe('rk-12345678');
  });

  it('请求体不含 grant 字段：公开入口没有授权注入面，runner 永远拿不到 grantId', async () => {
    const deps = makeDeps();
    const forged = { ...baseInput, grantId: 'grant-forged', origin: 'admin' } as typeof baseInput & { grantId: string; origin: string };
    await deps.service.ask(forged);
    const askInput = (deps.runner.ask as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect('grantId' in askInput).toBe(false);
    expect('origin' in askInput).toBe(false);
  });
});
