/**
 * AgentRunnerService：管理侧直调的**语义**测试。
 *
 * 这里钉住本轮修掉的根因，不是实现细节：
 * - 没有可用授权时如实 409，**不**拿一条用满的授权去空跑（原来是挑第一条没过期的就上）
 * - 运行没成功时如实报错，**不**返回 output:"" 当 201 成功（原来固定等 2 秒就交卷）
 * - 成功但零文本同样是失败，不许假装有产出
 * - 等待与取文本走 AgentExecutionService 的唯一实现，runner 不自己拍窗口
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { AgentRevisionDetail, AuthorizationGrantState } from '@walker/shared';
import { AgentRunnerService } from './agent-runner.service';
import { AgentUnitService } from './agent-unit.service';
import { PrismaAgentUnitRepository } from '../adapters/prisma-agent-unit.repository';
import type { PrismaPort } from '../ports/prisma.port';
import type { ExecutionRunOutcome } from '../execution/agent-execution.service';

const agentId = 'xiaoying';

const revision: AgentRevisionDetail['revisions'][number] = {
  id: 'rev-1', agentId, version: 1, prompt: '你是小影，只读站内助手。',
  providerId: 'deepseek-official', modelId: 'deepseek-flash',
  toolProfile: { id: 'read-only', version: 1 }, schemaVersion: 1,
  configHash: 'c'.repeat(64), createdAt: '2026-10-01T00:00:00.000Z',
};

const detail: AgentRevisionDetail = { id: agentId, name: '小影', archivedAt: null, revisions: [revision] };

const usableGrant = { id: 'grant-usable' } as unknown as AuthorizationGrantState;

function outcome(state: ExecutionRunOutcome['state'], stopReason: string | null = null): ExecutionRunOutcome {
  return { runId: 'run-1', state, stopReason, success: state === 'SUCCEEDED', elapsedMs: 4_399, tokensIn: 325, tokensOut: 273 };
}

async function failureOf(promise: Promise<unknown>) {
  const error = await promise.catch((caught) => caught);
  return (error as { getResponse?: () => { code?: string; state?: string; stopReason?: string; runId?: string } }).getResponse?.() ?? {};
}

describe('AgentRunnerService（直调语义）', () => {
  let prisma: PrismaClient;
  let agentService: AgentUnitService;

  const build = (options: {
    grant?: AuthorizationGrantState | null;
    detail?: AgentRevisionDetail | null;
    run?: ExecutionRunOutcome | null;
    text?: string;
  } = {}) => {
    const execution = {
      accept: vi.fn(async () => ({ id: 'run-1' })),
      awaitTerminal: vi.fn(async () => (options.run === undefined ? outcome('SUCCEEDED') : options.run)),
      savedText: vi.fn(async () => options.text ?? '你好！我是小影。'),
    };
    const authorization = {
      selectUsable: vi.fn(async () => (options.grant === undefined ? usableGrant : options.grant)),
    };
    const revisions = {
      detail: vi.fn(async () => (options.detail === undefined ? detail : options.detail)),
    };
    const runner = new AgentRunnerService(
      agentService,
      revisions as never,
      authorization as never,
      execution as never,
    );
    return { runner, execution, authorization, revisions };
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    const prismaPort: PrismaPort = { getClient: () => prisma, isWritable: () => true, ping: async () => true };
    agentService = new AgentUnitService(new PrismaAgentUnitRepository(prismaPort));
    await agentService.ensureDefaultAgent();
  });

  it('没有可用授权 → 409 grant-required，且绝不入队空跑', async () => {
    const h = build({ grant: null });
    expect(await failureOf(h.runner.runChat(agentId, { input: '你好，介绍一下你自己' }))).toMatchObject({ code: 'grant-required' });
    expect(h.execution.accept).not.toHaveBeenCalled();
  });

  it('额度用完的运行 → 明确失败（不再返回空串当成功）', async () => {
    const h = build({ run: outcome('FAILED', 'quota') });
    const failure = await failureOf(h.runner.runChat(agentId, { input: '你好' }));
    expect(failure).toMatchObject({ code: 'agent-run-quota', state: 'FAILED', stopReason: 'quota' });
    expect(h.execution.savedText).not.toHaveBeenCalled();
  });

  it('超时是 504 且带 stopReason，不再是「成功但没内容」', async () => {
    const h = build({ run: outcome('FAILED', 'deadline') });
    const failure = await failureOf(h.runner.runChat(agentId, { input: '你好' }));
    expect(failure).toMatchObject({ code: 'agent-run-timeout', stopReason: 'deadline' });
  });

  it('报告成功却零文本 → 502 agent-run-empty（同一类诚实约束）', async () => {
    const h = build({ text: '   ' });
    expect(await failureOf(h.runner.runChat(agentId, { input: '你好' }))).toMatchObject({ code: 'agent-run-empty' });
  });

  it('成功 → 输出与归因来自真实运行与修订', async () => {
    const h = build({ text: '你好！我是小影，Walker 站主 Dora 的只读助手。' });
    const result = await h.runner.runChat(agentId, { input: '你好，介绍一下你自己' });
    expect(result.output).toContain('我是小影');
    expect(result.providerId).toBe('deepseek-official');
    expect(result.model).toBe('deepseek-flash');
    expect(result.temperature).toBeNull();
    expect(result.usage).toEqual({ promptTokens: 325, completionTokens: 273, cacheHitTokens: 0 });
    expect(h.execution.awaitTerminal).toHaveBeenCalledWith('run-1');
  });

  it('输入与引擎覆盖仍按老规矩拒绝，且不触碰执行栈', async () => {
    const h = build();
    expect(await failureOf(h.runner.runChat(agentId, { input: 'x' }))).toMatchObject({ code: 'invalid-input' });
    expect(await failureOf(h.runner.runChat(agentId, { input: '你好', modelId: 'gpt' }))).toMatchObject({ code: 'execution-denied' });
    expect(h.execution.accept).not.toHaveBeenCalled();
  });

  it('没有修订 → 403，且不去选授权', async () => {
    const h = build({ detail: null });
    expect(await failureOf(h.runner.runChat(agentId, { input: '你好' }))).toMatchObject({ code: 'execution-denied' });
    expect(h.authorization.selectUsable).not.toHaveBeenCalled();
  });
});
