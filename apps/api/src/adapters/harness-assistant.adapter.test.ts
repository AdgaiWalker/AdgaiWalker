/**
 * HarnessAssistantAdapter 单测 — 红线全覆盖：
 * AI 可关 / 超时降级并重拉 / 输出拒收降级 / citations fail-closed / 多轮复用 session
 */
import { describe, expect, it } from 'vitest';
import type { AppConfigPort } from '../config/config.port';
import type { AssistantRunnerPort } from '../ports/assistant-runner.port';
import type {
  SiteContentFullEntry,
  SiteContentIndexPort,
} from '../ports/site-content-index.port';
import {
  HarnessAssistantAdapter,
  buildFirstTurnPrompt,
  type HarnessRuntimeLike,
} from './harness-assistant.adapter';

const config = (aiEnabled: boolean): AppConfigPort => ({
  getDatabaseUrl: () => undefined,
  isAiEnabled: () => aiEnabled,
  getHost: () => '127.0.0.1',
  getPort: () => 8788,
  getNodeEnv: () => 'test',
  getWorkRootDir: () => '/tmp',
  getWorkMaxUploadBytes: () => 1,
});

const ENTRIES: SiteContentFullEntry[] = [
  {
    slug: 'used-macbook-guide',
    title: '我的 MacBook M1 Pro',
    summary: '2800 块闲鱼',
    tags: ['省钱'],
    actionable: true,
    body: '正文：闲鱼购买 MacBook 的完整攻略。',
  },
  {
    slug: 'cc-intro',
    title: 'CC入门',
    summary: 'Claude Code',
    tags: [],
    actionable: false,
    body: '正文：从零驾驭 Claude Code。',
  },
];

const index: SiteContentIndexPort = {
  async loadCitable() {
    return ENTRIES.map(({ body: _b, ...rest }) => rest);
  },
  async loadCitableFull() {
    return ENTRIES;
  },
};

/** 总是返回规则兜底的假 fallback */
const fallback: AssistantRunnerPort = {
  async ask(input) {
    return {
      answer: '规则兜底回答。',
      citations: [],
      sessionId: input.sessionId ?? 'rule-session',
      aiUsedFlag: false,
      elapsedMs: 0,
    };
  },
};

function makeRuntime(
  behavior: 'ok' | 'slow' | 'bad-output' | 'throw',
): HarnessRuntimeLike & { calls: { prompt: string; sessionId?: string }[] } {
  const calls: { prompt: string; sessionId?: string }[] = [];
  return {
    calls,
    async run(prompt, opts) {
      calls.push({ prompt, sessionId: opts?.sessionId });
      if (behavior === 'slow') {
        await new Promise((r) => setTimeout(r, 300));
        return { sessionId: 'slow-session', finalResponse: '{"answer":"迟到的回答"}' };
      }
      if (behavior === 'throw') throw new Error('TransportClosedError');
      if (behavior === 'bad-output') return { sessionId: 's', finalResponse: '不是 JSON' };
      return {
        sessionId: 'dsh-session-1',
        finalResponse: JSON.stringify({
          answer: 'duola 是艺术生，用 AI 解决真实问题。',
          citations: ['used-macbook-guide', 'draft-post'],
        }),
      };
    },
    async close() {},
  };
}

function adapterFor(runtime: HarnessRuntimeLike, timeoutMs = 80) {
  return new HarnessAssistantAdapter(config(true), index, fallback, () => runtime, timeoutMs);
}

describe('HarnessAssistantAdapter', () => {
  it('AI 关：不建 runtime，直接兜底', async () => {
    let spawned = 0;
    const a = new HarnessAssistantAdapter(config(false), index, fallback, () => {
      spawned++;
      return makeRuntime('ok');
    });
    const r = await a.ask({ sessionId: null, text: 'duola 是谁', visitorKey: 'v1' });
    expect(spawned).toBe(0);
    expect(r.aiUsedFlag).toBe(false);
    expect(r.answer.length).toBeGreaterThanOrEqual(4);
  });

  it('AI 开：合法输出通过，citations 只留 citable，sessionId 返回真身', async () => {
    const rt = makeRuntime('ok');
    const r = await adapterFor(rt).ask({ sessionId: null, text: 'duola 是谁', visitorKey: 'v1' });
    expect(r.aiUsedFlag).toBe(true);
    expect(r.sessionId).toBe('dsh-session-1');
    expect(r.citations).toEqual([{ slug: 'used-macbook-guide' }]);
    // 首轮 prompt 含整库资料与输出契约
    expect(rt.calls[0]!.prompt).toContain('used-macbook-guide');
    expect(rt.calls[0]!.prompt).toContain('只输出一个 JSON 对象');
  });

  it('多轮：带 sessionId 时只发问题本身并透传 sessionId', async () => {
    const rt = makeRuntime('ok');
    await adapterFor(rt).ask({ sessionId: 'dsh-session-1', text: '他用什么电脑', visitorKey: 'v1' });
    expect(rt.calls[0]!.sessionId).toBe('dsh-session-1');
    expect(rt.calls[0]!.prompt).toBe('他用什么电脑');
  });

  it('超时：弃结果走兜底，runtime 被关闭且下问重建', async () => {
    const rt1 = makeRuntime('slow');
    let closed = 0;
    rt1.close = async () => {
      closed++;
    };
    let count = 0;
    const rt2 = makeRuntime('ok');
    const factory = () => (count++ === 0 ? rt1 : rt2);
    const a = new HarnessAssistantAdapter(config(true), index, fallback, factory, 30);
    const r = await a.ask({ sessionId: null, text: '慢问题', visitorKey: 'v1' });
    expect(r.aiUsedFlag).toBe(false);
    expect(closed).toBe(1);
    // 下一问用新 runtime 正常出 AI 结果
    const r2 = await a.ask({ sessionId: null, text: '快问题', visitorKey: 'v1' });
    expect(r2.aiUsedFlag).toBe(true);
    expect(count).toBe(2);
  });

  it('输出不合合同 / runtime 异常：降级兜底', async () => {
    const bad = await adapterFor(makeRuntime('bad-output')).ask({
      sessionId: null,
      text: '问题',
      visitorKey: 'v1',
    });
    expect(bad.aiUsedFlag).toBe(false);

    const thrown = await adapterFor(makeRuntime('throw')).ask({
      sessionId: null,
      text: '问题',
      visitorKey: 'v1',
    });
    expect(thrown.aiUsedFlag).toBe(false);
  });

  it('首条 prompt：小影人设 + 资料正文 + 问题', () => {
    const p = buildFirstTurnPrompt(ENTRIES, '你好');
    expect(p).toContain('你是小影');
    expect(p).toContain('第三人称');
    expect(p).toContain('闲鱼购买 MacBook 的完整攻略');
    expect(p).toContain('访客问题：你好');
  });
});
