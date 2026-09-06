import { describe, expect, it, vi } from 'vitest';
import type { AppConfigPort } from '../config/config.port';
import { DshAgentRunner, withJsonOutputContract } from './dsh-agent.runner';

const config = (aiEnabled: boolean): AppConfigPort => ({
  getDatabaseUrl: () => undefined,
  isAiEnabled: () => aiEnabled,
  getHost: () => '127.0.0.1',
  getPort: () => 8788,
  getNodeEnv: () => 'test',
  getWorkRootDir: () => '/tmp',
  getWorkMaxUploadBytes: () => 1,
});

function runtime(behavior: {
  finalResponse?: unknown;
  delayMs?: number;
  reject?: Error;
}) {
  const closed = vi.fn();
  return {
    closed,
    factory: () => ({
      async run(prompt: string) {
        if (behavior.delayMs) await new Promise((r) => setTimeout(r, behavior.delayMs));
        if (behavior.reject) throw behavior.reject;
        return { sessionId: 's', finalResponse: behavior.finalResponse ?? '{}' };
      },
      async close() {
        closed();
      },
    }) as never,
  };
}

describe('withJsonOutputContract', () => {
  it('原样保留配方 prompt 并追加 JSON 输出契约', () => {
    const wrapped = withJsonOutputContract('recipe=ai-content-v1@1\nstage=EDIT');
    expect(wrapped).toContain('stage=EDIT');
    expect(wrapped).toContain('只输出一个 JSON 对象');
  });
});

describe('DshAgentRunner', () => {
  it('AI 关：如实抛 ai-disabled，不起 runtime', async () => {
    const r = new DshAgentRunner(config(false), () => ({}) as never);
    await expect(r.run({ prompt: 'p', cwd: '/tmp' })).rejects.toThrow('ai-disabled');
  });

  it('合法 JSON 输出（字符串与对象两种形态）透传为 output', async () => {
    const rt = runtime({ finalResponse: '{"recipeVersion":1,"stage":"EDIT","output":{"body":"x"}}' });
    const r = new DshAgentRunner(config(true), rt.factory);
    const result = await r.run({ prompt: 'p', cwd: '/tmp' });
    expect(result.output).toEqual({ recipeVersion: 1, stage: 'EDIT', output: { body: 'x' } });
    expect(rt.closed).toHaveBeenCalledTimes(1);

    const rtObj = runtime({ finalResponse: { already: 'object' } });
    const r2 = new DshAgentRunner(config(true), rtObj.factory);
    const result2 = await r2.run({ prompt: 'p', cwd: '/tmp' });
    expect(result2.output).toEqual({ already: 'object' });
  });

  it('坏 JSON → runner-output-invalid-json；runtime 异常原样透传', async () => {
    const bad = new DshAgentRunner(config(true), runtime({ finalResponse: '不是 JSON' }).factory);
    await expect(bad.run({ prompt: 'p', cwd: '/tmp' })).rejects.toThrow('runner-output-invalid-json');

    const boom = new DshAgentRunner(config(true), runtime({ reject: new Error('TransportClosedError') }).factory);
    await expect(boom.run({ prompt: 'p', cwd: '/tmp' })).rejects.toThrow('TransportClosedError');
  });

  it('短调用超时：弃结果抛 runner-timeout，但常驻实例保留（不付冷启动税）', async () => {
    const rt = runtime({ finalResponse: '{}', delayMs: 80 });
    const r = new DshAgentRunner(config(true), rt.factory);
    await expect(r.run({ prompt: 'p', cwd: '/tmp', timeoutMs: 20 })).rejects.toThrow('runner-timeout');
    expect(rt.closed).not.toHaveBeenCalled();
  });

  it('取消：abort 抛 runner-aborted，短调用常驻实例保留', async () => {
    const rt = runtime({ finalResponse: '{}', delayMs: 5000 });
    const r = new DshAgentRunner(config(true), rt.factory);
    const ac = new AbortController();
    const pending = r.run({ prompt: 'p', cwd: '/tmp', timeoutMs: 10_000, signal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    await expect(pending).rejects.toThrow('runner-aborted');
    expect(rt.closed).not.toHaveBeenCalled();
  });
});

describe('DshAgentRunner 执行形态（M2 冒烟修正）', () => {
  it('短调用复用常驻实例：两次调用工厂只执行一次', async () => {
    let factoryCalls = 0;
    const rt = runtime({ finalResponse: '{"ok":1}' });
    const factory = () => {
      factoryCalls += 1;
      return rt.factory();
    };
    const r = new DshAgentRunner(config(true), factory);
    await r.run({ prompt: 'p', cwd: '/tmp', timeoutMs: 15_000 });
    await r.run({ prompt: 'p', cwd: '/tmp', timeoutMs: 15_000 });
    expect(factoryCalls).toBe(1);
    // 常驻实例不在单次调用后关闭
    expect(rt.closed).toHaveBeenCalledTimes(0);
  });

  it('短调用失败丢弃常驻实例，下次重拉', async () => {
    let calls = 0;
    const fail = runtime({ reject: new Error('TransportClosedError') });
    const ok = runtime({ finalResponse: '{"ok":1}' });
    const r = new DshAgentRunner(config(true), () => {
      calls += 1;
      return calls === 1 ? fail.factory() : ok.factory();
    });
    await expect(r.run({ prompt: 'p', cwd: '/tmp', timeoutMs: 15_000 })).rejects.toThrow('TransportClosedError');
    await expect(r.run({ prompt: 'p', cwd: '/tmp', timeoutMs: 15_000 })).resolves.toBeTruthy();
    expect(calls).toBe(2);
  });

  it('长调用（无 timeoutMs）独立实例：两次调用工厂各执行一次并各自关闭', async () => {
    let factoryCalls = 0;
    const rt = runtime({ finalResponse: '{"ok":1}' });
    const r = new DshAgentRunner(config(true), () => {
      factoryCalls += 1;
      return rt.factory();
    });
    await r.run({ prompt: 'p', cwd: '/tmp' });
    await r.run({ prompt: 'p', cwd: '/tmp' });
    expect(factoryCalls).toBe(2);
  });
});

describe('输出合同按调用形态区分（双合同超时修复）', () => {
  it('短调用 prompt 原样透传（调用方自带合同），长调用追加配方合同', async () => {
    const seen: string[] = [];
    const mk = () => ({
      async run(prompt: string) {
        seen.push(prompt);
        return { sessionId: 's', finalResponse: '{"ok":1}' };
      },
      async close() {},
    }) as never;
    const r = new DshAgentRunner(config(true), mk);
    await r.run({ prompt: 'PROMPT-A', cwd: '/tmp', timeoutMs: 15_000 }); // 短调用
    await r.run({ prompt: 'PROMPT-B', cwd: '/tmp' }); // 长调用
    expect(seen[0]).toBe('PROMPT-A'); // 原样
    expect(seen[1]).toContain('PROMPT-B');
    expect(seen[1]).toContain('recipeVersion'); // 追加配方合同
  });
});

describe('超时不丢常驻实例（15s 预算贴边修复）', () => {
  it('首次超时后实例保留：第二次调用复用同一 runtime，工厂只建一次', async () => {
    let factoryCalls = 0;
    let runCalls = 0;
    const mk = () => ({
      async run() {
        runCalls += 1;
        if (runCalls === 1) await new Promise((r) => setTimeout(r, 200)); // 首次超预算
        return { sessionId: 's', finalResponse: '{"ok":1}' };
      },
      close: vi.fn(async () => {}),
    });
    const r = new DshAgentRunner(config(true), () => {
      factoryCalls += 1;
      return mk();
    });
    await expect(r.run({ prompt: 'p', cwd: '/t', timeoutMs: 30 })).rejects.toThrow('runner-timeout');
    const ok = await r.run({ prompt: 'p', cwd: '/t', timeoutMs: 2_000 });
    expect(ok.output).toEqual({ ok: 1 });
    expect(factoryCalls).toBe(1); // 超时未重建
  });

  it('传输类故障仍重建实例', async () => {
    let calls = 0;
    const fail = { async run() { throw new Error('TransportClosedError'); }, close: vi.fn(async () => {}) };
    const ok = { async run() { return { sessionId: 's', finalResponse: '{"ok":1}' }; }, close: vi.fn(async () => {}) };
    const r = new DshAgentRunner(config(true), () => {
      calls += 1;
      return calls === 1 ? fail : ok;
    });
    await expect(r.run({ prompt: 'p', cwd: '/t', timeoutMs: 15_000 })).rejects.toThrow('TransportClosedError');
    await expect(r.run({ prompt: 'p', cwd: '/t', timeoutMs: 15_000 })).resolves.toBeTruthy();
    expect(calls).toBe(2); // 传输故障 → 重建
  });
});
