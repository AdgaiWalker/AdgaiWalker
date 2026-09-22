/**
 * AgentRunnerService & B-Trace Pipeline
 *
 * 这里钉住的核心行为：**直调是真调模型**，不是模板回放。
 * 因此 runner 依赖 `LlmClient` 端口而不是具体的供应商服务 —— 测试注入假实现即可，
 * 断言的是「输出来自模型、token 来自 usage、耗时是真实测量、失败可分类」。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import { AgentRunnerService } from './agent-runner.service';
import { AgentUnitService } from './agent-unit.service';
import { ModelProviderService } from '../model-providers/model-provider.service';
import { PrismaAgentUnitRepository } from '../adapters/prisma-agent-unit.repository';
import { PrismaModelProviderRepository } from '../adapters/prisma-model-provider.repository';
import type { PrismaPort } from '../ports/prisma.port';
import { LlmError, type LlmChatRequest, type LlmClient } from '../ports/llm.port';

const TEST_KEY = 'e'.repeat(64);
const MODEL_TEXT = '润色建议：把结论提到段首，删去第二段的重复论据。';

type StubLlm = LlmClient & { calls: LlmChatRequest[] };

/** 可控的假模型：记录收到的请求，可指定返回文本、延迟、或抛出分类错误 */
function stubLlm(options: { text?: string; delayMs?: number; error?: LlmError } = {}): StubLlm {
  const calls: LlmChatRequest[] = [];
  return {
    calls,
    async chat(request) {
      calls.push(request);
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      if (options.error) throw options.error;
      return {
        text: options.text ?? MODEL_TEXT,
        model: request.modelId,
        usage: { promptTokens: 1200, completionTokens: 40, cacheHitTokens: 900 },
        elapsedMs: options.delayMs ?? 5,
      };
    },
  };
}

describe('AgentRunnerService & B-Trace Pipeline', () => {
  let prisma: PrismaClient;
  let prismaPort: PrismaPort;
  let agentService: AgentUnitService;

  const runnerWith = (llm: LlmClient): AgentRunnerService =>
    new AgentRunnerService(prismaPort, agentService, llm, { async detail() { return null; } } as never, { async list() { return []; } } as never, { async accept() { throw new Error('不应直接调用模型'); } } as never, { async findById() { return null; }, async listEvents() { return []; } } as never);

  beforeAll(async () => {
    process.env.WALKER_CREDENTIAL_MASTER_KEY = TEST_KEY;
    prisma = new PrismaClient();
    await prisma.$connect();
    prismaPort = {
      getClient: () => prisma,
      isWritable: () => true,
      ping: async () => true,
    };

    agentService = new AgentUnitService(new PrismaAgentUnitRepository(prismaPort));
    const providerService = new ModelProviderService(new PrismaModelProviderRepository(prismaPort));

    await agentService.ensureDefaultAgent();
    await providerService.ensureDefaultProvider();
  });

  it('listLogFiles: 能列出 content/log/*.md 下的真实文件列表', async () => {
    const files = await runnerWith(stubLlm()).listLogFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.includes('ai-low-cost-access.md'))).toBe(true);
    expect(files.every((f) => f.startsWith('content/log/'))).toBe(true);
  });

  it('runFile: 路径穿越严格防御（越权目录返回 403）', async () => {
    await expect(
      runnerWith(stubLlm()).runFile('xiaoying', {
        targetFile: 'content/log/../../package.json',
        instruction: '分析文件',
      }),
    ).rejects.toThrow('目标文件必须位于 content/log/ 目录内');
  });

  it('runFile: 文件不存在时返回 404', async () => {
    await expect(
      runnerWith(stubLlm()).runFile('xiaoying', {
        targetFile: 'content/log/non-existent-file.md',
        instruction: '分析文件',
      }),
    ).rejects.toThrow('未找到目标文件');
  });

  it('runFile: 智能体不存在时返回 404', async () => {
    await expect(
      runnerWith(stubLlm()).runFile('non-existent-agent', {
        targetFile: 'content/log/ai-low-cost-access.md',
        instruction: '分析文件',
      }),
    ).rejects.toThrow('智能体不存在');
  });

  it('runFile: 没有修订和授权时不直接调用模型', async () => {
    const llm = stubLlm({ delayMs: 40 });
    const failure = await runnerWith(llm).runFile('xiaoying', {
      targetFile: 'content/log/ai-low-cost-access.md',
      instruction: '检查全文逻辑连贯性并润色结论',
    }).catch((caught) => caught);
    expect((failure as { response?: { code?: string } }).response?.code).toBe('execution-denied');
    expect(llm.calls).toHaveLength(0);
  });

  it('缺凭据、鉴权失败和超时不再绕过统一执行', async () => {
    for (const llm of [stubLlm({ error: new LlmError('llm-no-credential', '缺少凭据') }), stubLlm({ error: new LlmError('llm-auth-failed', '401') }), stubLlm({ delayMs: 200 })]) {
      const failure = await runnerWith(llm).runFile('xiaoying', { targetFile: 'content/log/ai-low-cost-access.md', instruction: '分析文件' }).catch((caught) => caught);
      expect((failure as { response?: { code?: string } }).response?.code).toBe('execution-denied');
      expect(llm.calls).toHaveLength(0);
    }
  });
});
