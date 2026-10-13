import { describe, expect, it } from 'vitest';
import { TransportClosedError } from '@deepseek-ai/dsh-sdk-client';
import {
  HarnessRuntimeAdapter,
  classifyModelText,
  readInstalledRuntimeVersions,
  readRuntimeUsage,
  type SdkRuntime,
} from './harness-runtime.adapter';

const owner = { visitorKey: 'visitor-a', agentRevisionId: 'rev-1' };
const other = { visitorKey: 'visitor-b', agentRevisionId: 'rev-1' };

function runtime(run: SdkRuntime['run'], start = async () => {}): { sdk: SdkRuntime; runs: number; closed: number } {
  const state = { runs: 0, closed: 0, sdk: null as unknown as SdkRuntime };
  state.sdk = {
    start,
    run: async (input, opts) => {
      state.runs += 1;
      return run(input, opts);
    },
    close: async () => {
      state.closed += 1;
    },
  };
  return state;
}

function adapterFor(sdk: SdkRuntime, versions = () => ({ sdk: '0.1.5-rc.2', runtime: '0.1.5-rc.2' })) {
  return new HarnessRuntimeAdapter(() => sdk, versions);
}

/** 按 agentId 造不同实例，并记录每次创建/关闭，用于验证 R26 的按 Agent 切换。 */
function perAgentFactory() {
  const created: (string | null)[] = [];
  const instances: { agentId: string | null; runs: number; closed: boolean }[] = [];
  const factory = (agentId: string | null): SdkRuntime => {
    created.push(agentId);
    const state = { agentId, runs: 0, closed: false };
    instances.push(state);
    const sdk: SdkRuntime = {
      start: async () => {},
      run: async () => {
        state.runs += 1;
        return { sessionId: `s-${agentId ?? 'none'}`, finalResponse: '{"answer":"ok"}' };
      },
      close: async () => {
        state.closed = true;
      },
    };
    return sdk;
  };
  return { factory, created, instances };
}

describe('模型文本与用量', () => {
  it('坏 JSON、单个对象和两份合同各自有确定分类', () => {
    expect(classifyModelText('{oops')).toEqual({ outputKind: 'bad-json', json: null });
    expect(classifyModelText('')).toEqual({ outputKind: 'bad-json', json: null });
    expect(classifyModelText('{"answer":"好"}')).toEqual({ outputKind: 'json', json: { answer: '好' } });
    expect(classifyModelText('{"a":1}{"b":2}')).toEqual({ outputKind: 'duplicate-contract', json: null });
  });

  /**
   * 回归：用量挂在 **assistant/message** 上（rc.3 实测
   * data.usage = {inputTokens, outputTokens, totalTokens, cacheReadTokens, reasoningTokens}）。
   * 曾经这里读 step/end——它的 data 只有 {turn, step}，导致每次运行 tokens 都是 null，
   * 界面显示「成功但零用量」，看起来像空成功。
   */
  it('用量取自 assistant/message；step/end 不带用量（rc.3 实际协议）', () => {
    expect(readRuntimeUsage([])).toBeNull();
    // step/end 里即便有人塞 usage 也不算（它不是承载用量的事件）
    expect(readRuntimeUsage([{ type: 'step/end', data: { turn: 1, step: 1 } }])).toBeNull();
    // 字段不是数字 → 未知（不假装知道）
    expect(readRuntimeUsage([
      { type: 'assistant/message', data: { usage: { inputTokens: '1', outputTokens: 2 } } },
    ])).toBeNull();
    // 真实形状：累加
    expect(readRuntimeUsage([
      { type: 'assistant/message', data: { usage: { inputTokens: 154, outputTokens: 2, cacheReadTokens: 3968, totalTokens: 4124 } } },
    ])).toEqual({ inputTokens: 154, outputTokens: 2, cacheReadTokens: 3968 });
    expect(readRuntimeUsage([
      { type: 'assistant/message', data: { usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 4 } } },
      { type: 'assistant/message', data: { usage: { inputTokens: 3, outputTokens: 1 } } },
    ])).toEqual({ inputTokens: 13, outputTokens: 3, cacheReadTokens: 4 });
  });
});

describe('HarnessRuntimeAdapter', () => {
  it('同 Agent 切换修订模型时重建 runtime 并传入新选择', async () => {
    const selections: string[] = [];
    let closed = 0;
    const adapter = new HarnessRuntimeAdapter((_agentId, _persona, selection) => {
      selections.push(`${selection?.providerId}:${selection?.modelId}`);
      return {
        start: async () => {},
        run: async () => ({ sessionId: 's', finalResponse: '{"answer":"ok"}' }),
        close: async () => { closed += 1; },
      };
    }, () => ({ sdk: 'same', runtime: 'same' }));
    await adapter.run({ prompt: 'a', owner: { ...owner, agentId: 'one', providerId: 'openai', modelId: 'gpt-a' } });
    await adapter.run({ prompt: 'b', owner: { ...owner, agentId: 'one', providerId: 'anthropic', modelId: 'claude-b' } });
    expect(selections).toEqual(['openai:gpt-a', 'anthropic:claude-b']);
    expect(closed).toBe(1);
  });
  it('安装的 SDK 与 runtime 版本一致', () => {
    expect(readInstalledRuntimeVersions()).toEqual({ sdk: '0.1.5-rc.3', runtime: '0.1.5-rc.3' });
  });

  it('版本不一致时不启动 runtime', async () => {
    const fake = runtime(async () => ({ sessionId: 's', finalResponse: '{}' }));
    const adapter = adapterFor(fake.sdk, () => ({ sdk: '0.1.5-rc.2', runtime: '9.9.9' }));
    await expect(adapter.start()).rejects.toThrow('version-mismatch');
    const result = await adapter.run({ prompt: 'hi', owner });
    expect(result).toEqual({ ok: false, failure: 'version-mismatch', sessionId: null });
    expect(fake.runs).toBe(0);
  });

  it('prompt 里已有同一输出合同时不再追加，也不调用 runtime', async () => {
    const fake = runtime(async () => ({ sessionId: 's', finalResponse: '{}' }));
    const contract = '只输出一个 JSON 对象';
    const result = await adapterFor(fake.sdk).run({
      prompt: `问题\n${contract}`,
      outputContract: contract,
      owner,
    });
    expect(result).toEqual({ ok: false, failure: 'duplicate-contract', sessionId: null });
    expect(fake.runs).toBe(0);
  });

  it('坏 JSON、重复合同和未知用量都留在同一次结果里', async () => {
    const bad = runtime(async (_input, opts) => {
      opts?.onNotification?.({ type: 'assistant/message', data: { usage: { inputTokens: true, outputTokens: 1 } } });
      return { sessionId: 'bad', finalResponse: '{oops' };
    });
    const badResult = await adapterFor(bad.sdk).run({ prompt: 'hi', owner });
    expect(badResult).toMatchObject({ ok: true, outputKind: 'bad-json', json: null, usage: null, sessionId: 'bad' });

    const duplicated = runtime(async () => ({ sessionId: 'dup', finalResponse: '{"a":1}{"b":2}' }));
    const dupResult = await adapterFor(duplicated.sdk).run({ prompt: 'hi', owner });
    expect(dupResult).toMatchObject({ ok: true, outputKind: 'duplicate-contract', json: null, usage: null });
  });

  it('传输断开返回确定失败并关闭当前 runtime', async () => {
    const fake = runtime(async () => {
      throw new TransportClosedError('lost');
    });
    const result = await adapterFor(fake.sdk).run({ prompt: 'hi', owner });
    expect(result).toEqual({ ok: false, failure: 'transport-closed', sessionId: null });
    expect(fake.closed).toBe(1);
  });

  it('会话只属于第一次绑定的访客和修订', async () => {
    const fake = runtime(async () => ({ sessionId: 's1', finalResponse: '{"ok":true}' }));
    const adapter = adapterFor(fake.sdk);
    const first = await adapter.run({ prompt: 'hi', owner });
    expect(first).toMatchObject({ ok: true, sessionId: 's1', outputKind: 'json' });
    const stolen = await adapter.run({ prompt: 'hi', owner: other, sessionId: 's1' });
    expect(stolen).toEqual({ ok: false, failure: 'session-owner-mismatch', sessionId: 's1' });
    expect(fake.runs).toBe(1);
  });

  it('重启后旧 SDK 会话不再直接复用，而用完整公开上下文开新会话', async () => {
    const calls: Array<{ input: string; sessionId?: string }> = [];
    const fake = runtime(async (input, opts) => {
      calls.push({ input, sessionId: opts?.sessionId });
      return { sessionId: `new-${calls.length}`, finalResponse: '{"answer":"ok"}' };
    });
    const adapter = adapterFor(fake.sdk);
    await adapter.run({ prompt: '只问一句', freshPrompt: '公开资料 + 只问一句', sessionId: 'saved-before-restart', owner });
    expect(calls[0]).toEqual({ input: '公开资料 + 只问一句', sessionId: undefined });
    await adapter.run({ prompt: '下一句', freshPrompt: '公开资料 + 下一句', sessionId: 'new-1', owner });
    expect(calls[1]).toEqual({ input: '下一句', sessionId: 'new-1' });
    await adapter.close();
    await adapter.run({ prompt: '再一句', freshPrompt: '公开资料 + 再一句', sessionId: 'new-2', owner });
    expect(calls[2]).toEqual({ input: '公开资料 + 再一句', sessionId: undefined });
  });

  it('前一次调用未结束时后来者得到 busy', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fake = runtime(async () => {
      await gate;
      return { sessionId: 's', finalResponse: '{"ok":true}' };
    });
    const adapter = adapterFor(fake.sdk);
    const first = adapter.run({ prompt: 'hi', owner });
    const second = await adapter.run({ prompt: 'again', owner });
    expect(second).toEqual({ ok: false, failure: 'busy', sessionId: null });
    release?.();
    await expect(first).resolves.toMatchObject({ ok: true, sessionId: 's' });
  });

  /**
   * 回归：流式文本在 rc.3 里挂在 assistant/message 的 data.stream 上
   * （条目形如 {type:'text-chunks', texts:['好']}）。
   * 曾经这里只认 assistant/chunk + chunk.type==='text-delta'——那个形状在 rc.3 不存在，
   * 于是流式文本从未外发过（只有终值兜底），观察者永远收不到 text 事件。
   */
  it('观察者收到文本增量与用量（rc.3 实际事件形状）', async () => {
    const seen: Array<{ kind: string; text?: string; usage?: unknown }> = [];
    const fake = runtime(async (_input, opts) => {
      opts?.onNotification?.({
        method: 'session.event',
        params: {
          event: {
            type: 'assistant/message',
            data: {
              turn: 1,
              step: 1,
              stream: [
                { type: 'chunk', chunk: { type: 'block-start', index: 0, blockType: 'text' } },
                { type: 'text-chunks', index: 0, texts: ['{"a":'] },
              ],
              usage: { inputTokens: 154, outputTokens: 2, cacheReadTokens: 3968, totalTokens: 4124 },
            },
          },
        },
      });
      return { sessionId: 's', finalResponse: '{"a":1}' };
    });
    const adapter = adapterFor(fake.sdk);
    const stop = adapter.observe((event) => seen.push(event));
    const result = await adapter.run({ prompt: 'hi', owner });
    stop();
    expect(result).toMatchObject({
      ok: true,
      outputKind: 'json',
      json: { a: 1 },
      usage: { inputTokens: 154, outputTokens: 2, cacheReadTokens: 3968 },
    });
    expect(seen.map((event) => event.kind)).toEqual(['text', 'usage']);
    expect(seen[0]?.text).toBe('{"a":');
    expect(seen[1]?.usage).toEqual({ inputTokens: 154, outputTokens: 2, cacheReadTokens: 3968 });
  });

  it('从 pinned runtime 通知记录 root session 与 native fork ID', async () => {
    const registered: Array<{ sessionId: string; kind: string; parentSessionId?: string | null }> = [];
    const fake = runtime(async (_input, opts) => {
      opts?.onNotification?.({ method: 'session.event', params: { sessionId: 'root-session', event: { type: 'user/message', data: {} } } });
      opts?.onNotification?.({ method: 'subagent.started', params: { parentSessionId: 'root-session', childSessionId: 'fork-session' } });
      return { sessionId: 'root-session', finalResponse: '{"ok":true}' };
    });
    const result = await adapterFor(fake.sdk).run({
      prompt: 'hi', owner,
      onSessionResource: async (resource) => { registered.push(resource); },
    });

    expect(result.ok).toBe(true);
    expect(registered).toEqual([
      { sessionId: 'root-session', kind: 'native-session' },
      { sessionId: 'fork-session', kind: 'native-fork', parentSessionId: 'root-session' },
    ]);
  });

  it('没有用量的事件只报未知，不假装知道', async () => {
    const seen: Array<{ kind: string; usage?: unknown }> = [];
    const fake = runtime(async () => ({ sessionId: 's', finalResponse: '{}' }));
    const adapter = adapterFor(fake.sdk);
    const stop = adapter.observe((event) => seen.push(event));
    const result = await adapter.run({ prompt: 'hi', owner });
    stop();
    expect(result).toMatchObject({ ok: true, usage: null });
    expect(seen.map((event) => event.kind)).toEqual(['usage']);
    expect(seen[0]?.usage).toBeNull();
  });

  it('按 Agent 切换 runtime 实例：不同 Agent 换实例，同 Agent 复用（R26）', async () => {
    const { factory, created, instances } = perAgentFactory();
    const adapter = new HarnessRuntimeAdapter((agentId) => factory(agentId));

    // 第一次：consultant
    const a = await adapter.run({ prompt: 'hi', owner: { ...owner, agentId: 'consultant' } });
    expect(a.ok).toBe(true);
    expect(created).toEqual(['consultant']);

    // 同一个 Agent 再来一次：复用实例，不重建
    await adapter.run({ prompt: 'hi again', owner: { ...owner, agentId: 'consultant' } });
    expect(created).toEqual(['consultant']);
    expect(instances[0]!.runs).toBe(2);

    // 换 Agent：旧实例必须先关闭（单槽纪律，不留孤儿），再建新实例
    const b = await adapter.run({ prompt: 'hi', owner: { ...owner, agentId: 'engineer' } });
    expect(b.ok).toBe(true);
    expect(created).toEqual(['consultant', 'engineer']);
    expect(instances[0]!.closed).toBe(true);
    expect(instances[1]!.agentId).toBe('engineer');

    // 无 agentId（受众级）也是另一种目标，需要再切一次
    await adapter.run({ prompt: 'hi', owner });
    expect(created).toEqual(['consultant', 'engineer', null]);
    expect(instances[1]!.closed).toBe(true);
  });

  /**
   * 回归（R32，站主实测）：Agent 提示词从未进入模型——改了修订仍跑旧人格。
   *
   * 契约：实例的复用条件必须是「同一 Agent **且**提示词未变」。
   * 提示词属于修订级配置：只按 agentId 缓存会让新修订继续用旧 persona。
   */
  it('提示词变化必须重建实例（否则新修订继续跑旧人格）', async () => {
    const built: Array<{ agentId: string | null; persona: string | null | undefined }> = [];
    const instances: Array<{ runs: number; closed: boolean }> = [];
    const factory = (agentId: string | null, persona?: string | null) => {
      built.push({ agentId, persona });
      const inst = {
        runs: 0,
        closed: false,
        async start() {},
        async run() {
          inst.runs += 1;
          return { sessionId: 's', finalResponse: 'ok' };
        },
        async close() {
          inst.closed = true;
        },
      };
      instances.push(inst);
      return inst;
    };
    const adapter = new HarnessRuntimeAdapter(factory);

    // 第一次：带 persona A
    await adapter.run({ prompt: 'hi', owner: { ...owner, agentId: 'xiaoying', systemPrompt: '你是小影。' } });
    expect(built).toEqual([{ agentId: 'xiaoying', persona: '你是小影。' }]);

    // 同 Agent 同提示词：复用
    await adapter.run({ prompt: 'hi again', owner: { ...owner, agentId: 'xiaoying', systemPrompt: '你是小影。' } });
    expect(built).toHaveLength(1);
    expect(instances[0]!.runs).toBe(2);

    // 同 Agent **换提示词**（新修订）：必须重建，且旧实例先关闭
    await adapter.run({ prompt: 'hi', owner: { ...owner, agentId: 'xiaoying', systemPrompt: '你是工程师。' } });
    expect(built).toHaveLength(2);
    expect(built[1]).toEqual({ agentId: 'xiaoying', persona: '你是工程师。' });
    expect(instances[0]!.closed).toBe(true);

    // 提示词清空也是变化：要再重建一次
    await adapter.run({ prompt: 'hi', owner: { ...owner, agentId: 'xiaoying', systemPrompt: null } });
    expect(built).toHaveLength(3);
    expect(built[2]).toEqual({ agentId: 'xiaoying', persona: null });
  });

  it('close 成功才给出退出证明，失败时不把 runtime 当成已经退出', async () => {
    const fake = runtime(async () => ({ sessionId: 's', finalResponse: '{"ok":true}' }));
    const adapter = adapterFor(fake.sdk);
    await adapter.run({ prompt: 'hi', owner });
    await expect(adapter.close()).resolves.toEqual({ exited: true });
    expect(fake.closed).toBe(1);
    const broken = runtime(async () => ({ sessionId: 's', finalResponse: '{"ok":true}' }));
    broken.sdk.close = async () => { throw new Error('仍在运行'); };
    const stuck = adapterFor(broken.sdk);
    await stuck.run({ prompt: 'hi', owner });
    await expect(stuck.close()).rejects.toThrow('仍在运行');
  });
});
