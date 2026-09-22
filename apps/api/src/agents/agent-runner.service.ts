import { finished } from 'node:stream/promises';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { AgentUnitService } from './agent-unit.service';
import { LLM_CLIENT, LlmError, type LlmClient, type LlmErrorCode } from '../ports/llm.port';
import { AGENT_REVISION_REPOSITORY, type AgentRevisionRepositoryPort } from '../ports/agent-revision.repository';
import { AUTHORIZATION_REPOSITORY, type AuthorizationRepositoryPort } from '../ports/authorization.repository';
import { AGENT_EXECUTION_REPOSITORY, type AgentExecutionRepositoryPort } from '../ports/agent-execution.repository';
import { AgentExecutionService } from '../execution/agent-execution.service';
import { storageUnavailable } from '../common/http-error';

/** 单次直调塞进提示词的文件上限（字符）。超长截断并如实标注，不静默丢内容 */
const PROMPT_BUDGET_CHARS = 24_000;
/** 运行记录里输出/指令的入库截断（运行数据要留证据，不该把整篇报告塞进库） */
const INPUT_STORE_CHARS = 4_000;

export type AgentChatResult = {
  agentId: string;
  output: string;
  /** 引擎归因：本次实际解析到的供应商与模型 */
  providerId: string | null;
  model: string;
  temperature: number;
  /** 行为归因：当次系统提示词全文 */
  promptSnapshot: string;
  elapsedMs: number;
  usage: { promptTokens: number; completionTokens: number; cacheHitTokens: number };
};

/** LlmError 的分类 → HTTP：每一类都指向一个可执行的下一步 */
const LLM_FAILURE_HTTP: Record<LlmErrorCode, { code: string; status: number }> = {
  'llm-no-provider': { code: 'model-provider-missing', status: HttpStatus.SERVICE_UNAVAILABLE },
  'llm-no-credential': { code: 'model-credential-missing', status: HttpStatus.SERVICE_UNAVAILABLE },
  'llm-auth-failed': { code: 'model-auth-failed', status: HttpStatus.BAD_GATEWAY },
  'llm-request-rejected': { code: 'model-request-rejected', status: HttpStatus.BAD_REQUEST },
  'llm-upstream-failed': { code: 'model-upstream-failed', status: HttpStatus.BAD_GATEWAY },
  'llm-timeout': { code: 'model-timeout', status: HttpStatus.GATEWAY_TIMEOUT },
  'llm-bad-response': { code: 'model-bad-response', status: HttpStatus.BAD_GATEWAY },
};

export type TimelineSegment = {
  key: string;
  label: string;
  percent: number;
  color: string;
  elapsedMs: number;
};

export type RunTelemetry = {
  turns: number;
  steps: number;
  tokensPrompt: number;
  tokensCompletion: number;
  tokensCacheHit: number;
  cacheHitPercent: number;
  tokPerSec: number;
  elapsedMs: number;
};

export type AgentRunResult = {
  runId: string;
  agentId: string;
  targetFile: string;
  status: 'SUCCESS' | 'FAILED';
  output: string;
  elapsedMs: number;
  metrics: RunTelemetry;
  timeline: TimelineSegment[];
  traceLogPath: string;
};

@Injectable()
export class AgentRunnerService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    // 显式 token：本仓的 vitest 走 esbuild，**不发 design:paramtypes 元数据**，
    // 「按类型注入」在测试环境里解析不到（会得到一个 undefined 的依赖）。
    // 一律用 @Inject，生产与测试同语义。
    @Inject(AgentUnitService) private readonly agentService: AgentUnitService,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    @Inject(AGENT_REVISION_REPOSITORY) private readonly revisions: AgentRevisionRepositoryPort,
    @Inject(AUTHORIZATION_REPOSITORY) private readonly grants: AuthorizationRepositoryPort,
    @Inject(AgentExecutionService) private readonly execution: AgentExecutionService,
    @Inject(AGENT_EXECUTION_REPOSITORY) private readonly executions: AgentExecutionRepositoryPort,
  ) {}

  private db() {
    const c = this.prisma.getClient();
    if (!c) throw storageUnavailable();
    return c;
  }

  /** 获取仓库根目录路径 */
  private getRepoRootDir(): string {
    return path.resolve(process.cwd(), '../..');
  }

  /** 获取日志文件存储根目录 */
  private getRunsDir(): string {
    const dir = path.resolve(process.cwd(), 'data/runs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /** 列出 content/log/*.md 下所有可选文件 (供直调下拉框使用) */
  async listLogFiles(): Promise<string[]> {
    const logDir = path.resolve(this.getRepoRootDir(), 'content/log');
    if (!fs.existsSync(logDir)) return [];
    const entries = await fs.promises.readdir(logDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.mdx')))
      .map((e) => `content/log/${e.name}`)
      .sort();
  }

  /** 校验文件路径合法性 (防路径穿越) */
  private resolveSafeFilePath(targetFile: string): string {
    const repoRoot = this.getRepoRootDir();
    const contentLogRoot = path.resolve(repoRoot, 'content/log');
    const resolved = path.resolve(repoRoot, targetFile);

    const relative = path.relative(contentLogRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new HttpException(
        { code: 'forbidden-path', message: '目标文件必须位于 content/log/ 目录内' },
        HttpStatus.FORBIDDEN,
      );
    }
    if (!fs.existsSync(resolved)) {
      throw new HttpException(
        { code: 'file-not-found', message: `未找到目标文件: ${targetFile}` },
        HttpStatus.NOT_FOUND,
      );
    }
    return resolved;
  }

  /**
   * 试一句话：无文件的聊天式直调（调试的主力动作）。
   * 与 runFile 共用归因与失败分类；不落 trace 文件（单轮对话没有阶段可看）。
   */
  async runChat(
    agentId: string,
    input: {
      input: string;
      providerId?: string | null;
      modelId?: string;
      temperature?: number;
    },
  ): Promise<AgentChatResult> {
    const agent = await this.agentService.findById(agentId);
    if (!agent) {
      throw new HttpException({ code: 'agent-not-found', message: '智能体不存在' }, HttpStatus.NOT_FOUND);
    }
    const text = input.input?.trim() ?? '';
    if (text.length < 2) {
      throw new HttpException(
        { code: 'invalid-input', message: 'input 至少 2 个字符' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 引擎解析顺序：本次覆盖 → 角色绑定 → 默认供应商（归因记录的是**最终**解析结果）
    if (input.providerId || input.modelId || input.temperature !== undefined) {
      throw new HttpException({ code: 'execution-denied', message: '不能通过直调更换模型或温度' }, HttpStatus.FORBIDDEN);
    }
    const submitted = await this.submitOwned(agentId, text);
    return {
      agentId,
      output: submitted.text,
      providerId: null,
      model: submitted.modelId,
      temperature: 0,
      promptSnapshot: agent.prompt,
      elapsedMs: submitted.elapsedMs ?? 0,
      usage: {
        promptTokens: submitted.tokensIn ?? 0,
        completionTokens: submitted.tokensOut ?? 0,
        cacheHitTokens: 0,
      },
    };
  }

  /** 旧直调不再写 AgentRun，也不直接调用模型。 */
  private async submitOwned(agentId: string, input: string) {
    const detail = await this.revisions.detail(agentId);
    const revision = detail?.revisions[0];
    if (!detail || detail.archivedAt || !revision) {
      throw new HttpException({ code: 'execution-denied', message: '当前请求不允许执行' }, HttpStatus.FORBIDDEN);
    }
    const grant = (await this.grants.list(agentId)).find((item) => item.revokedAt === null && item.expiresAt !== null && Date.parse(item.expiresAt) > Date.now() && item.actions.includes('agent:run') && item.resourceScope.kind === 'agent' && item.resourceScope.ids.includes(agentId));
    if (!grant) throw new HttpException({ code: 'execution-denied', message: '当前请求不允许执行' }, HttpStatus.FORBIDDEN);
    const accepted = await this.execution.accept({
      idempotencyKey: 'legacy' + randomUUID().replace(/-/g, '').slice(0, 16),
      kind: 'chat', agentRevisionId: revision.id, input, grantId: grant.id,
    });
    let finished = await this.executions.findById(accepted.id);
    for (let attempt = 0; attempt < 40 && finished && !['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN'].includes(finished.state); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      finished = await this.executions.findById(accepted.id);
    }
    const events = await this.executions.listEvents(accepted.id, 0, 20);
    return {
      id: accepted.id,
      text: events.filter((event) => event.kind === 'text').map((event) => event.text ?? '').join(''),
      modelId: revision.modelId,
      elapsedMs: finished?.elapsedMs ?? null,
      tokensIn: finished?.tokensIn ?? null,
      tokensOut: finished?.tokensOut ?? null,
    };
  }

  /**
   * 同题对比：同一句输入 × 多个引擎目标，各自落一条**可归因**的 run。
   * 单目标失败不拖垮整组（对比视图要的是并排，哪怕一格是错误码）。
   */
  async compare(
    agentId: string,
    input: { input: string; targets: Array<{ providerId?: string | null; modelId?: string; label?: string }> },
  ): Promise<{ agentId: string; input: string; results: Array<AgentChatResult | { label?: string; providerId: string | null; modelId?: string; status: 'FAILED'; errorCode: string; detail: string }> }> {
    const targets = input.targets.filter((target) => target && typeof target === 'object');
    if (targets.length < 2 || targets.length > 4) {
      throw new HttpException(
        { code: 'invalid-compare', message: '对比需要 2~4 个引擎目标' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const results = [];
    for (const target of targets) {
      if (target.providerId || target.modelId) {
        results.push({ label: target.label, providerId: target.providerId ?? null, modelId: target.modelId, status: 'FAILED' as const, errorCode: 'execution-denied', detail: '不能通过直调更换模型' });
        continue;
      }
      try {
        const submitted = await this.submitOwned(agentId, input.input);
        results.push({ agentId, output: submitted.text, providerId: null, model: submitted.modelId, temperature: 0, promptSnapshot: '', elapsedMs: submitted.elapsedMs ?? 0, usage: { promptTokens: submitted.tokensIn ?? 0, completionTokens: submitted.tokensOut ?? 0, cacheHitTokens: 0 }, label: target.label });
      } catch (error) {
        const code = error instanceof HttpException ? (error.getResponse() as { code?: string }).code ?? 'execution-denied' : 'execution-denied';
        results.push({ label: target.label, providerId: target.providerId ?? null, modelId: target.modelId, status: 'FAILED' as const, errorCode: code, detail: error instanceof Error ? error.message : '当前请求不允许执行' });
      }
    }
    return { agentId, input: input.input, results };
  }

  private mapLlmFailure(error: unknown): { code: string; status: number; message: string } {
    if (error instanceof LlmError) {
      const mapped = LLM_FAILURE_HTTP[error.code];
      return { code: mapped.code, status: mapped.status, message: error.message };
    }
    return {
      code: 'agent-run-failed',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  private async recordChatRun(input: {
    agentId: string;
    input: string;
    output: string;
    providerId: string | null;
    model: string;
    temperature: number;
    status: 'SUCCESS' | 'FAILED';
    errorCode: string | null;
    tokensPrompt: number;
    tokensCompletion: number;
    elapsedMs: number;
  }): Promise<void> {
    try {
      await this.db().agentRun.create({
        data: {
          agentId: input.agentId,
          targetFile: null,
          instruction: input.input,
          output: input.output.slice(0, INPUT_STORE_CHARS),
          model: input.model,
          providerId: input.providerId,
          promptSnapshot: null,
          temperature: input.temperature,
          tokensPrompt: input.tokensPrompt,
          tokensCompletion: input.tokensCompletion,
          tokensCacheHit: 0,
          cacheHitPercent: 0,
          elapsedMs: input.elapsedMs,
          status: input.status,
        },
      });
    } catch {
      /* 运行数据写失败不应影响本次调用 */
    }
  }

  /** 执行文件直调任务并落盘独立 trace.jsonl (带 120s 强制超时熔断保护) */
  async runFile(
    agentId: string,
    input: {
      targetFile: string;
      instruction: string;
      /** 引擎覆盖：不改角色配置先试另一个模型 */
      providerId?: string | null;
      modelId?: string;
      temperature?: number;
    },
    options?: { timeoutMs?: number },
  ): Promise<AgentRunResult> {
    const timeoutMs = options?.timeoutMs ?? 120_000;
    const agent = await this.agentService.findById(agentId);
    if (!agent) {
      throw new HttpException({ code: 'agent-not-found', message: '智能体不存在' }, HttpStatus.NOT_FOUND);
    }

    const safeFilePath = this.resolveSafeFilePath(input.targetFile);
    let fileContent: string;
    try {
      fileContent = await fs.promises.readFile(safeFilePath, 'utf8');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new HttpException({ code: 'file-not-found', message: '未找到目标文件' }, HttpStatus.NOT_FOUND);
      }
      throw error;
    }
    if (input.providerId || input.modelId || input.temperature !== undefined) {
      throw new HttpException({ code: 'execution-denied', message: '不能通过直调更换模型或温度' }, HttpStatus.FORBIDDEN);
    }
    const submitted = await this.submitOwned(agentId, `指令：${input.instruction}\n目标文件：${input.targetFile}\n\n${fileContent.slice(0, PROMPT_BUDGET_CHARS)}`);
    return {
      runId: submitted.id,
      agentId,
      targetFile: input.targetFile,
      status: 'SUCCESS',
      output: submitted.text,
      elapsedMs: submitted.elapsedMs ?? 0,
      metrics: {
        turns: 1, steps: 1,
        tokensPrompt: submitted.tokensIn ?? 0,
        tokensCompletion: submitted.tokensOut ?? 0,
        tokensCacheHit: 0, cacheHitPercent: 0, tokPerSec: 0,
        elapsedMs: submitted.elapsedMs ?? 0,
      },
      timeline: [],
      traceLogPath: '',
    };
  }

  private async recordFailedRun(input: {
    runId: string;
    agentId: string;
    targetFile: string;
    instruction: string;
    model: string;
    message: string;
    elapsedMs: number;
    traceLogPath: string;
  }): Promise<void> {
    try {
      await this.db().agentRun.create({
        data: {
          id: input.runId,
          agentId: input.agentId,
          targetFile: input.targetFile,
          instruction: input.instruction,
          output: input.message,
          model: input.model,
          tokensPrompt: 0,
          tokensCompletion: 0,
          tokensCacheHit: 0,
          cacheHitPercent: 0,
          elapsedMs: input.elapsedMs,
          traceLogPath: input.traceLogPath,
          status: 'FAILED',
        },
      });
    } catch {
      /* 索引写失败不应掩盖真正的失败原因 */
    }
  }

  /** 获取智能体历史运行索引列表 */
  async getRunsByAgent(agentId: string) {
    return this.db().agentRun.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}
