/**
 * AiNextStepAdapter 单测 — 红线全覆盖：
 * AI 可关 / 失败降级规则版 / 输出不合契约拒收 / slug 只认 citable 集合
 */
import { describe, expect, it } from 'vitest';
import type { AppConfigPort } from '../config/config.port';
import type { AgentRunnerPort } from '../ports/agent-runner.port';
import type {
  SiteContentIndexEntry,
  SiteContentIndexPort,
} from '../ports/site-content-index.port';
import {
  AiNextStepAdapter,
  buildAiNextStepPrompt,
} from './ai-nextstep.adapter';

function makeConfig(aiEnabled: boolean): AppConfigPort {
  return {
    getDatabaseUrl: () => 'file:test.db',
    isAiEnabled: () => aiEnabled,
    getHost: () => '127.0.0.1',
    getPort: () => 8788,
    getNodeEnv: () => 'test',
    getWorkRootDir: () => '/tmp',
    getWorkMaxUploadBytes: () => 1,
  };
}

function makeRunner(
  output: unknown,
  calls: { prompts: string[] } = { prompts: [] },
): AgentRunnerPort {
  return {
    async run(input) {
      calls.prompts.push(input.prompt);
      if (output instanceof Error) throw output;
      return { output, rawEvents: [], elapsedMs: 1 };
    },
  };
}

function makeIndex(entries: SiteContentIndexEntry[], fail = false): SiteContentIndexPort {
  return {
    async loadCitable() {
      if (fail) throw new Error('site-content-index-unavailable');
      return entries;
    },
    async loadCitableFull() {
      if (fail) throw new Error('site-content-index-unavailable');
      return entries.map((e) => ({ ...e, body: `《${e.title}》正文` }));
    },
  };
}

const ENTRIES = [
  {
    slug: 'ai-low-cost-access',
    title: '低成本用上 AI',
    summary: '渠道与步骤',
    tags: ['ai'],
    actionable: true,
  },
  {
    slug: 'vibe0s',
    title: 'vibe0s',
    summary: 'Skill 编排',
    tags: [],
    actionable: false,
  },
];

describe('AiNextStepAdapter', () => {
  it('AI 关闭：不调 runner，直接规则兜底且 nextStep 非空', async () => {
    const calls = { prompts: [] };
    const adapter = new AiNextStepAdapter(
      makeConfig(false),
      makeRunner({ bucketId: 'coding', nextStep: '不该出现' }, calls),
      makeIndex(ENTRIES),
    );
    const r = await adapter.generate('想学 AI 但不知从哪开始');
    expect(calls.prompts).toHaveLength(0);
    expect(r.aiUsedFlag).toBe(false);
    expect(r.nextStep.length).toBeGreaterThanOrEqual(4);
    expect(r.suggestedSlug).toBeNull();
  });

  it('AI 开启 + 合法输出：aiUsedFlag=true，slug/title 来自索引', async () => {
    const adapter = new AiNextStepAdapter(
      makeConfig(true),
      makeRunner({
        bucketId: 'learn-ai',
        nextStep: '先挑一个最小场景连做三次，记下每次卡点。',
        suggestedSlug: 'ai-low-cost-access',
      }),
      makeIndex(ENTRIES),
    );
    const r = await adapter.generate('想学 AI 做周报，第一步是什么');
    expect(r.aiUsedFlag).toBe(true);
    expect(r.bucketId).toBe('learn-ai');
    expect(r.suggestedSlug).toBe('ai-low-cost-access');
    expect(r.suggestedTitle).toBe('低成本用上 AI');
  });

  it('AI 输出引用非 citable slug：整体保留但 slug 降为 null', async () => {
    const adapter = new AiNextStepAdapter(
      makeConfig(true),
      makeRunner({
        bucketId: 'coding',
        nextStep: '复现问题并写清期望与实际。',
        suggestedSlug: 'not-in-index',
      }),
      makeIndex(ENTRIES),
    );
    const r = await adapter.generate('改页面有 bug 排查不了');
    expect(r.aiUsedFlag).toBe(true);
    expect(r.suggestedSlug).toBeNull();
    expect(r.suggestedTitle).toBeNull();
  });

  it('AI 输出不合契约（桶非法/超长/非对象）：降级规则版', async () => {
    for (const bad of [
      { bucketId: 'random', nextStep: '随便做点什么。' },
      { bucketId: 'coding', nextStep: 'x'.repeat(201) },
      'plain text',
      null,
    ]) {
      const adapter = new AiNextStepAdapter(
        makeConfig(true),
        makeRunner(bad),
        makeIndex(ENTRIES),
      );
      const r = await adapter.generate('表单收集报名信息怎么做');
      expect(r.aiUsedFlag).toBe(false);
      expect(r.nextStep.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('runner 超时/异常：降级规则版，不抛出', async () => {
    const adapter = new AiNextStepAdapter(
      makeConfig(true),
      makeRunner(new Error('runner-timeout')),
      makeIndex(ENTRIES),
    );
    const r = await adapter.generate('每天重复加班想提效');
    expect(r.aiUsedFlag).toBe(false);
    expect(r.nextStep.length).toBeGreaterThanOrEqual(4);
  });

  it('内容索引不可用：仍出 AI 建议，slug 推荐失效', async () => {
    const adapter = new AiNextStepAdapter(
      makeConfig(true),
      makeRunner({
        bucketId: 'learn-ai',
        nextStep: '先挑一个最小场景连做三次。',
        suggestedSlug: 'ai-low-cost-access',
      }),
      makeIndex([], true),
    );
    const r = await adapter.generate('想学 AI');
    expect(r.aiUsedFlag).toBe(true);
    expect(r.suggestedSlug).toBeNull();
  });

  it('prompt 带可引用清单与卡点；空索引时明确禁推', async () => {
    const withEntries = buildAiNextStepPrompt('卡点', ENTRIES);
    expect(withEntries).toContain('ai-low-cost-access｜低成本用上 AI');
    expect(withEntries).toContain('访客卡点：卡点');

    const empty = buildAiNextStepPrompt('卡点', []);
    expect(empty).toContain('suggestedSlug 必须为 null');
    expect(empty).not.toContain('ai-low-cost-access');
  });

  it('runner 收到的超时预算是访客级（≤15s）', async () => {
    const seen: number[] = [];
    const runner: AgentRunnerPort = {
      async run(input) {
        seen.push(input.timeoutMs ?? 0);
        return { output: { bucketId: 'default', nextStep: '写清场景再提交。' }, rawEvents: [], elapsedMs: 1 };
      },
    };
    const adapter = new AiNextStepAdapter(makeConfig(true), runner, makeIndex(ENTRIES));
    await adapter.generate('不知道卡在哪');
    expect(seen[0]).toBeLessThanOrEqual(15_000);
  });
});
