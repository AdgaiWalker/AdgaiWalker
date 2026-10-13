/**
 * AgentExecutionService 的**唯一等待与取结果**实现。
 *
 * 这里钉住的是本轮修掉的根因：等待窗口由运行自己的 `deadline` 决定，
 * 调用方不再各自拍一个魔法秒数（历史上两处分别拍 1.5s / 2s，模型要 2.3–32 秒，
 * 于是「答得快就成功、答得慢就返回空」）。
 */
import { describe, expect, it } from 'vitest';
import type { AgentExecutionRecord } from '../ports/agent-execution.repository';
import { AgentExecutionService } from './agent-execution.service';

function record(overrides: Partial<AgentExecutionRecord> = {}): AgentExecutionRecord {
  return {
    id: 'run-1', kind: 'chat', origin: 'admin', actor: 'owner', actorScope: 'admin:owner',
    agentRevisionId: 'rev-1', requestKey: 'request-1', inputHash: 'h'.repeat(64),
    deadline: new Date(Date.now() + 60_000), input: '你好',
    state: 'RUNNING', attempt: 0, leaseOwner: 'owner', leaseEpoch: 1, leaseUntil: null,
    stopReason: null, tokensIn: null, tokensOut: null, elapsedMs: null,
    testCaseId: null, suiteVersion: null, configHash: null, assertion: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  } as AgentExecutionRecord;
}

/** 只覆盖 awaitTerminal / savedText 用到的两个方法，其余端口不参与。 */
function serviceWith(runs: {
  findById: (id: string) => Promise<AgentExecutionRecord | null>;
  listEvents?: (id: string, after: number, limit: number) => Promise<Array<{ seq: number; kind: 'text' | 'usage'; text: string | null; tokensIn: number | null; tokensOut: number | null; createdAt: Date }>>;
}) {
  return new AgentExecutionService(
    {} as never, {} as never,
    { findById: runs.findById, listEvents: runs.listEvents ?? (async () => []) } as never,
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
  );
}

describe('awaitTerminal（唯一等待实现）', () => {
  it('已经是终态就不轮询，直接返回结果', async () => {
    let reads = 0;
    const service = serviceWith({
      findById: async () => { reads += 1; return record({ state: 'SUCCEEDED', elapsedMs: 4_399, tokensIn: 10, tokensOut: 20 }); },
    });
    const outcome = await service.awaitTerminal('run-1');
    expect(outcome).toMatchObject({ state: 'SUCCEEDED', success: true, elapsedMs: 4_399, tokensIn: 10, tokensOut: 20 });
    expect(reads).toBe(1);
  });

  it('一直等到运行自己结束，不用调用方拍的窗口', async () => {
    const states = ['RUNNING', 'RUNNING', 'SUCCEEDED'] as const;
    let index = 0;
    const service = serviceWith({
      findById: async () => record({ state: states[Math.min(index++, states.length - 1)]! }),
    });
    const outcome = await service.awaitTerminal('run-1');
    expect(outcome).toMatchObject({ state: 'SUCCEEDED', success: true });
    expect(index).toBeGreaterThan(1);
  });

  it('运行不存在时返回 null，不编造状态', async () => {
    expect(await serviceWith({ findById: async () => null }).awaitTerminal('missing')).toBeNull();
  });

  it('失败终态如实带 stopReason，success 恒为 false', async () => {
    const service = serviceWith({ findById: async () => record({ state: 'FAILED', stopReason: 'quota' }) });
    expect(await service.awaitTerminal('run-1')).toMatchObject({ state: 'FAILED', success: false, stopReason: 'quota' });
  });
});

describe('savedText（唯一取文本实现）', () => {
  it('只拼 text 事件，按 seq 顺序，忽略 usage', async () => {
    const service = serviceWith({
      findById: async () => record({ state: 'SUCCEEDED' }),
      listEvents: async () => [
        { seq: 1, kind: 'text' as const, text: '你好', tokensIn: null, tokensOut: null, createdAt: new Date() },
        { seq: 2, kind: 'usage' as const, text: null, tokensIn: 3, tokensOut: 4, createdAt: new Date() },
        { seq: 3, kind: 'text' as const, text: '，我是小影。', tokensIn: null, tokensOut: null, createdAt: new Date() },
      ],
    });
    expect(await service.savedText('run-1')).toBe('你好，我是小影。');
  });
});
