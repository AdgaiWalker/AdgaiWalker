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

describe('模型文本与用量', () => {
  it('坏 JSON、单个对象和两份合同各自有确定分类', () => {
    expect(classifyModelText('{oops')).toEqual({ outputKind: 'bad-json', json: null });
    expect(classifyModelText('')).toEqual({ outputKind: 'bad-json', json: null });
    expect(classifyModelText('{"answer":"好"}')).toEqual({ outputKind: 'json', json: { answer: '好' } });
    expect(classifyModelText('{"a":1}{"b":2}')).toEqual({ outputKind: 'duplicate-contract', json: null });
  });

  it('缺用量是未知，字段不是数字也是未知，数字则累加', () => {
    expect(readRuntimeUsage([])).toBeNull();
    expect(readRuntimeUsage([{ type: 'step/end', data: { usage: { inputTokens: '1', outputTokens: 2 } } }])).toBeNull();
    expect(readRuntimeUsage([
      { type: 'step/end', data: { usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 4 } } },
      { type: 'step/end', data: { usage: { inputTokens: 3, outputTokens: 1 } } },
    ])).toEqual({ inputTokens: 13, outputTokens: 3, cacheReadTokens: 4 });
  });
});

describe('HarnessRuntimeAdapter', () => {
  it('安装的 SDK 与 runtime 版本一致', () => {
    expect(readInstalledRuntimeVersions()).toEqual({ sdk: '0.1.5-rc.2', runtime: '0.1.5-rc.2' });
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
      opts?.onNotification?.({ type: 'step/end', data: { usage: { inputTokens: true, outputTokens: 1 } } });
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

  it('观察者收到文本，未知用量以 null 结束', async () => {
    const seen: Array<{ kind: string; text?: string; usage?: unknown }> = [];
    const fake = runtime(async (_input, opts) => {
      opts?.onNotification?.({
        method: 'session.event',
        params: { event: { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: '{"a":' } } } },
      });
      opts?.onNotification?.({ type: 'step/end', data: {} });
      return { sessionId: 's', finalResponse: '{"a":1}' };
    });
    const adapter = adapterFor(fake.sdk);
    const stop = adapter.observe((event) => seen.push(event));
    const result = await adapter.run({ prompt: 'hi', owner });
    stop();
    expect(result).toMatchObject({ ok: true, outputKind: 'json', usage: null, json: { a: 1 } });
    expect(seen.map((event) => event.kind)).toEqual(['text', 'usage']);
    expect(seen[0]?.text).toBe('{"a":');
    expect(seen[1]?.usage).toBeNull();
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
