import { beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import { AgentRunnerService } from './agent-runner.service';
import { AgentUnitService } from './agent-unit.service';
import { ModelProviderService } from '../model-providers/model-provider.service';
import { PrismaAgentUnitRepository } from '../adapters/prisma-agent-unit.repository';
import { PrismaModelProviderRepository } from '../adapters/prisma-model-provider.repository';
import type { PrismaPort } from '../ports/prisma.port';

const TEST_KEY = 'e'.repeat(64);

describe('AgentRunnerService & B-Trace Pipeline', () => {
  let prisma: PrismaClient;
  let runner: AgentRunnerService;
  let agentService: AgentUnitService;

  beforeAll(async () => {
    process.env.WALKER_CREDENTIAL_MASTER_KEY = TEST_KEY;
    prisma = new PrismaClient();
    await prisma.$connect();
    const prismaPort: PrismaPort = {
      getClient: () => prisma,
      isWritable: () => true,
      ping: async () => true,
    };

    const agentRepo = new PrismaAgentUnitRepository(prismaPort);
    const modelRepo = new PrismaModelProviderRepository(prismaPort);
    agentService = new AgentUnitService(agentRepo);
    const providerService = new ModelProviderService(modelRepo);

    await agentService.ensureDefaultAgent();
    await providerService.ensureDefaultProvider();

    runner = new AgentRunnerService(prismaPort, agentService, providerService);
  });

  it('listLogFiles: 能列出 content/log/*.md 下的真实文件列表', async () => {
    const files = await runner.listLogFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.includes('ai-low-cost-access.md'))).toBe(true);
    expect(files.every((f) => f.startsWith('content/log/'))).toBe(true);
  });

  it('runFile: 路径穿越严格防御（越权目录返回 403）', async () => {
    await expect(
      runner.runFile('xiaoying', {
        targetFile: 'content/log/../../package.json',
        instruction: '分析文件',
      }),
    ).rejects.toThrow('目标文件必须位于 content/log/ 目录内');
  });

  it('runFile: 文件不存在时返回 404', async () => {
    await expect(
      runner.runFile('xiaoying', {
        targetFile: 'content/log/non-existent-file.md',
        instruction: '分析文件',
      }),
    ).rejects.toThrow('未找到目标文件');
  });

  it('runFile: 智能体不存在时返回 404', async () => {
    await expect(
      runner.runFile('non-existent-agent', {
        targetFile: 'content/log/ai-low-cost-access.md',
        instruction: '分析文件',
      }),
    ).rejects.toThrow('智能体不存在');
  });

  it('runFile: 走通真实直调，生成 trace.jsonl 并沉淀 AgentRun 索引', async () => {
    const result = await runner.runFile('xiaoying', {
      targetFile: 'content/log/ai-low-cost-access.md',
      instruction: '检查全文逻辑连贯性并润色结论',
    });

    // 1. 验证直调回显数据
    expect(result.status).toBe('SUCCESS');
    expect(result.runId).toMatch(/^run_\d+_[0-9a-f]+$/);
    expect(result.output).toContain('【小影 直调报告】');
    expect(result.metrics.cacheHitPercent).toBe(72.5);

    // 2. 验证甘特图百分比总和等于 100%
    const totalPct = result.timeline.reduce((sum, s) => sum + s.percent, 0);
    expect(totalPct).toBe(100);

    // 3. 验证专属 trace.jsonl 物理文件在磁盘正确生成
    expect(fs.existsSync(result.traceLogPath)).toBe(true);
    const fileText = fs.readFileSync(result.traceLogPath, 'utf8');
    const lines = fileText.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(4); // start, input, model, tool, done

    // 4. 验证 getRunTrace 读取轨迹
    const traceEvents = await runner.getRunTrace(result.runId);
    expect(traceEvents.length).toBeGreaterThanOrEqual(4);
    expect(traceEvents[0].event).toBe('start');
    expect(traceEvents[traceEvents.length - 1].event).toBe('done');

    // 5. 验证 getRunsByAgent 获取履历索引
    const runs = await runner.getRunsByAgent('xiaoying');
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0].id).toBe(result.runId);
    expect(runs[0].targetFile).toBe('content/log/ai-low-cost-access.md');
  });

  it('runFile: 超时熔断保护（触发超时强制中断并记录错误）', async () => {
    // 传入 1ms 超时时间模拟极端超时触发
    await expect(
      runner.runFile(
        'xiaoying',
        {
          targetFile: 'content/log/ai-low-cost-access.md',
          instruction: '检查全文逻辑连贯性并润色结论',
        },
        { timeoutMs: 1 },
      ),
    ).rejects.toThrow('直调任务超时熔断（>120s），已自动释放资源');
  });
});
