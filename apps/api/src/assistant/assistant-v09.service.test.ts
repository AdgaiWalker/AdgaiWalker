/**
 * V09 单测：进入 SDK 前的必要脱敏，且落库与发给模型的是同一份文本。
 * 验收点：带测试秘密的输入不出现在 prompt/落库，正文引用不被无差别破坏。
 */
import { describe, expect, it, vi } from 'vitest';
import type { AssistantRunResult } from '@walker/shared';
import type { AppConfigPort } from '../config/config.port';
import type { AssistantRepositoryPort } from '../ports/assistant.repository';
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
  answer: '已收到。',
  citations: [],
  sessionId: 's-ai',
  aiUsedFlag: true,
  elapsedMs: 10,
};

function makeDeps() {
  const runner: AssistantRunnerPort = { ask: vi.fn(async () => aiResult) };
  const fallback: AssistantRunnerPort = { ask: vi.fn(async () => ({ ...aiResult, aiUsedFlag: false })) };
  const events: FeatureEventPort = {
    record: vi.fn(async () => {}),
    listRecent: vi.fn(async () => []),
    aggregate: vi.fn(async () => ({ byFeature: {}, failCodes: {} })),
  };
  const repo: AssistantRepositoryPort = {
    upsertSession: vi.fn(async () => {}),
    findSession: vi.fn(async () => null),
    saveRun: vi.fn(async () => {}),
    listRuns: vi.fn(async () => []),
    findRunByRequest: vi.fn(async () => null),
    bumpRequests: vi.fn(async () => 1),
    addTokens: vi.fn(async () => {}),
  };
  const rateLimit: RateLimitPort = { consume: () => true };
  const service = new AssistantService(config(), runner, fallback as never, repo, rateLimit, events);
  return { service, runner, repo };
}

const base = { body: '什么是知识图谱', anonId: 'a'.repeat(64), ipKey: 'ip', isAuthenticated: false };

describe('AssistantService V09 输入侧脱敏', () => {
  it('密钥不进 prompt：发给 runner 的文本已替换', async () => {
    const d = makeDeps();
    await d.service.ask({ ...base, body: '我的 key 是 sk-abcdefghijklmnopqrstuvwx，帮我看看' });
    const prompt = (d.runner.ask as ReturnType<typeof vi.fn>).mock.calls[0]![0].text as string;
    expect(prompt).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    expect(prompt).toContain('[redacted-api-key]');
  });

  it('落库与 prompt 是同一份脱敏文本，不各留一份原文', async () => {
    const d = makeDeps();
    await d.service.ask({ ...base, body: '邮箱 me@example.com，手机 13812345678' });
    const prompt = (d.runner.ask as ReturnType<typeof vi.fn>).mock.calls[0]![0].text as string;
    const saved = (d.repo.saveRun as ReturnType<typeof vi.fn>).mock.calls[0]![0].question as string;
    expect(saved).toBe(prompt);
    expect(saved).not.toContain('me@example.com');
    expect(saved).not.toContain('13812345678');
    expect(saved).toContain('[redacted-email]');
    expect(saved).toContain('[redacted-mobile]');
  });

  it('正文引用与普通日期数字不被破坏', async () => {
    const d = makeDeps();
    const body = '参见 /posts/ai-low-cost-access，2026-09-22 更新，共 3 节';
    await d.service.ask({ ...base, body });
    const prompt = (d.runner.ask as ReturnType<typeof vi.fn>).mock.calls[0]![0].text as string;
    expect(prompt).toBe(body);
  });

  it('PEM 私钥块整体替换，不残留关键行', async () => {
    const d = makeDeps();
    const body = '这是配置\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----';
    await d.service.ask({ ...base, body });
    const saved = (d.repo.saveRun as ReturnType<typeof vi.fn>).mock.calls[0]![0].question as string;
    expect(saved).not.toContain('MIIEowIBAAKCAQEA');
    expect(saved).toContain('[redacted-private-key]');
  });
});
