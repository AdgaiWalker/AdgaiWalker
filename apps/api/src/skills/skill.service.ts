/**
 * 技能服务 —— 「技能即文件」的消费侧：列出、执行、导出。
 *
 * 执行走 `LlmClient` 端口（与工作台直调同一个模型出口），失败分类照旧
 * （没配 Key / 鉴权失败 / 上游 5xx 各有各的码）。
 * 导出三件事全部由 shared 的纯函数生成：提示词、调用示例、接口契约
 * 与技能声明同源，不可能漂移。
 */
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  buildCallExamples,
  buildIntegrationPrompt,
  buildInterfaceData,
  checkSkillCase,
  type SkillCase,
  type SkillInterfaceData,
  type SkillManifest,
} from '@walker/shared';
import { LLM_CLIENT, LlmError, type LlmChatResult, type LlmClient } from '../ports/llm.port';
import { SKILL_CATALOG, type SkillCatalogPort, type SkillDescriptor } from '../ports/skill.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { storageUnavailable } from '../common/http-error';

/** 输入入库前的截断长度（运行数据要留证据，但不该把整篇文件塞进库） */
const INPUT_STORE_LIMIT = 500;

/** LlmError 分类 → HTTP（与工作台直调同一套映射语义） */
const LLM_FAILURE_HTTP: Record<string, { code: string; status: number }> = {
  'llm-no-provider': { code: 'model-provider-missing', status: HttpStatus.SERVICE_UNAVAILABLE },
  'llm-no-credential': { code: 'model-credential-missing', status: HttpStatus.SERVICE_UNAVAILABLE },
  'llm-auth-failed': { code: 'model-auth-failed', status: HttpStatus.BAD_GATEWAY },
  'llm-request-rejected': { code: 'model-request-rejected', status: HttpStatus.BAD_REQUEST },
  'llm-upstream-failed': { code: 'model-upstream-failed', status: HttpStatus.BAD_GATEWAY },
  'llm-timeout': { code: 'model-timeout', status: HttpStatus.GATEWAY_TIMEOUT },
  'llm-bad-response': { code: 'model-bad-response', status: HttpStatus.BAD_GATEWAY },
};

/** 运行数据（可从 SkillRun 表随时重建；技能列表据此显示「谁在被用、贵不贵」） */
export type SkillStats = {
  runs: number;
  failed: number;
  avgElapsedMs: number;
  tokensPrompt: number;
  tokensCompletion: number;
  lastRunAt: string | null;
  /** 最近一次失败的分类码，便于直接看出「是没配 Key 还是上游挂了」 */
  lastErrorCode: string | null;
};

const EMPTY_STATS: SkillStats = {
  runs: 0,
  failed: 0,
  avgElapsedMs: 0,
  tokensPrompt: 0,
  tokensCompletion: 0,
  lastRunAt: null,
  lastErrorCode: null,
};

export type SkillOverview = {
  id: string;
  name: string;
  icon: string;
  version: string;
  description: string;
  dir: string;
  /** 该技能声明的能力需求（不是具体模型） */
  requirement: SkillManifest['model']['requirement'];
  params: SkillManifest['model']['params'];
  caseCount: number;
  stats: SkillStats;
};

export type SkillSelfcheckCase =
  | {
      caseId: string;
      ok: true;
      output: string;
      model: string;
      elapsedMs: number;
    }
  | {
      caseId: string;
      ok: false;
      /** 期望未满足的具体条目（仅当模型有回答时） */
      failures: string[];
      /** 运行/调用层的失败码（没配 Key、上游 5xx 等） */
      errorCode: string | null;
      detail: string;
    };

export type SkillSelfcheckResult = {
  skillId: string;
  version: string;
  total: number;
  passed: number;
  results: SkillSelfcheckCase[];
};

export type SkillRunRecord = {
  id: string;
  status: string;
  errorCode: string | null;
  model: string;
  elapsedMs: number;
  tokensPrompt: number;
  tokensCompletion: number;
  createdAt: string;
};

export type SkillRunAnswer = {
  skillId: string;
  skillVersion: string;
  output: string;
  model: string;
  elapsedMs: number;
  usage: { promptTokens: number; completionTokens: number; cacheHitTokens: number };
};

export type SkillExportBundle = {
  skill: { id: string; name: string; version: string; dir: string };
  /** 贴给任何 AI 即可完成对接 */
  integrationPrompt: string;
  /** 给代码读的接口契约 */
  interfaceData: SkillInterfaceData;
  examples: { curl: string; fetch: string; sse: string };
  /** 技能包文件内容：键为文件名，值为内容 —— 前端/agent 可直接落盘成目录 */
  pack: Record<string, string>;
};

function overviewOf(skill: SkillDescriptor, stats: SkillStats): SkillOverview {
  const { manifest } = skill;
  return {
    id: manifest.id,
    name: manifest.name,
    icon: manifest.icon,
    version: manifest.version,
    description: manifest.description,
    dir: skill.dir,
    requirement: manifest.model.requirement,
    params: manifest.model.params,
    caseCount: skill.cases.length,
    stats,
  };
}

@Injectable()
export class SkillService {
  constructor(
    @Inject(SKILL_CATALOG) private readonly catalog: SkillCatalogPort,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    @Inject(PRISMA) private readonly prisma: PrismaPort,
  ) {}

  private db() {
    const client = this.prisma.getClient();
    if (!client) throw storageUnavailable();
    return client;
  }

  async list(): Promise<{ skills: SkillOverview[]; problems: Array<{ dir: string; reason: string }> }> {
    const page = await this.catalog.list();
    const stats = await this.statsBySkill();
    return {
      skills: page.skills.map((skill) => overviewOf(skill, stats.get(skill.manifest.id) ?? EMPTY_STATS)),
      problems: page.problems,
    };
  }

  /** 按技能聚合运行数据；读不出来不应让技能列表打不开（降级为零数据） */
  private async statsBySkill(): Promise<Map<string, SkillStats>> {
    const map = new Map<string, SkillStats>();
    try {
      const db = this.db();
      const totals = await db.skillRun.groupBy({
        by: ['skillId'],
        _count: { _all: true },
        _avg: { elapsedMs: true },
        _sum: { tokensPrompt: true, tokensCompletion: true },
        _max: { createdAt: true },
      });
      for (const row of totals) {
        map.set(row.skillId, {
          runs: row._count._all,
          failed: 0,
          avgElapsedMs: Math.round(row._avg.elapsedMs ?? 0),
          tokensPrompt: row._sum.tokensPrompt ?? 0,
          tokensCompletion: row._sum.tokensCompletion ?? 0,
          lastRunAt: row._max.createdAt ? row._max.createdAt.toISOString() : null,
          lastErrorCode: null,
        });
      }
      const failures = await db.skillRun.groupBy({
        by: ['skillId'],
        where: { status: 'FAILED' },
        _count: { _all: true },
      });
      for (const row of failures) {
        const entry = map.get(row.skillId);
        if (entry) entry.failed = row._count._all;
      }
      const lastFailures = await db.skillRun.findMany({
        where: { status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        distinct: ['skillId'],
        select: { skillId: true, errorCode: true },
      });
      for (const row of lastFailures) {
        const entry = map.get(row.skillId);
        if (entry) entry.lastErrorCode = row.errorCode;
      }
    } catch {
      /* 运行数据不可用：技能列表照常显示，只是没有统计 */
    }
    return map;
  }

  /**
   * 自检：逐条跑 `cases.json`，按显式期望判分（contains/notContains/minChars）。
   * 判分是「期望是否满足」，不做语义评价；每条考题各自落一条运行记录
   * （失败也记）—— 自检就是调试闭环里可重复执行的那部分。
   */
  async selfcheck(id: string): Promise<SkillSelfcheckResult> {
    const skill = await this.require(id);
    const cases = skill.cases.slice(0, 8);
    if (cases.length === 0) {
      throw new HttpException(
        { code: 'no-cases', message: '该技能还没有考题：在 cases.json 里加几条再自检' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const results: SkillSelfcheckCase[] = [];
    for (const item of cases) {
      const started = Date.now();
      try {
        const answer: LlmChatResult = await this.llm.chat({
          providerId: skill.manifest.bindingExample.providerId,
          modelId: skill.manifest.bindingExample.modelId,
          temperature: skill.manifest.model.params.temperature,
          maxTokens: skill.manifest.model.params.maxTokens,
          messages: [
            { role: 'system', content: skill.systemPrompt },
            { role: 'user', content: item.input },
          ],
        });
        const verdict = checkSkillCase(answer.text, item.expect);
        await this.recordRun({
          skillId: skill.manifest.id,
          skillVersion: skill.manifest.version,
          userInput: item.input,
          output: answer.text,
          model: answer.model,
          status: verdict.ok ? 'SUCCESS' : 'FAILED',
          errorCode: verdict.ok ? null : 'selfcheck-expectation',
          tokensPrompt: answer.usage.promptTokens,
          tokensCompletion: answer.usage.completionTokens,
          elapsedMs: answer.elapsedMs,
        });
        results.push(
          verdict.ok
            ? {
                caseId: item.id,
                ok: true,
                output: answer.text.slice(0, 240),
                model: answer.model,
                elapsedMs: answer.elapsedMs,
              }
            : {
                caseId: item.id,
                ok: false,
                failures: verdict.failures,
                errorCode: null,
                detail: '回答未满足期望（明细见 failures）',
              },
        );
      } catch (error) {
        const mapped =
          error instanceof LlmError
            ? (LLM_FAILURE_HTTP[error.code] ?? { code: 'model-failed' })
            : { code: 'selfcheck-failed' };
        const message = error instanceof Error ? error.message : String(error);
        await this.recordRun({
          skillId: skill.manifest.id,
          skillVersion: skill.manifest.version,
          userInput: item.input,
          output: message,
          model: skill.manifest.bindingExample.modelId,
          status: 'FAILED',
          errorCode: mapped.code,
          tokensPrompt: 0,
          tokensCompletion: 0,
          elapsedMs: Date.now() - started,
        });
        results.push({ caseId: item.id, ok: false, failures: [], errorCode: mapped.code, detail: message });
      }
    }

    return {
      skillId: skill.manifest.id,
      version: skill.manifest.version,
      total: results.length,
      passed: results.filter((item) => item.ok).length,
      results,
    };
  }

  /** 最近的运行记录（展示用，10 条足够看出趋势） */
  async recentRuns(id: string): Promise<SkillRunRecord[]> {
    await this.require(id);
    try {
      const rows = await this.db().skillRun.findMany({
        where: { skillId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      return rows.map((row) => ({
        id: row.id,
        status: row.status,
        errorCode: row.errorCode,
        model: row.model,
        elapsedMs: row.elapsedMs,
        tokensPrompt: row.tokensPrompt,
        tokensCompletion: row.tokensCompletion,
        createdAt: row.createdAt.toISOString(),
      }));
    } catch {
      return [];
    }
  }

  /** 记一条运行；自身失败不掩盖原始结果 */
  private async recordRun(input: {
    skillId: string;
    skillVersion: string;
    userInput: string;
    output: string;
    model: string;
    status: 'SUCCESS' | 'FAILED';
    errorCode: string | null;
    tokensPrompt: number;
    tokensCompletion: number;
    elapsedMs: number;
  }): Promise<void> {
    try {
      await this.db().skillRun.create({
        data: {
          skillId: input.skillId,
          skillVersion: input.skillVersion,
          input: input.userInput.slice(0, INPUT_STORE_LIMIT),
          output: input.output.slice(0, INPUT_STORE_LIMIT),
          model: input.model,
          status: input.status,
          errorCode: input.errorCode,
          tokensPrompt: input.tokensPrompt,
          tokensCompletion: input.tokensCompletion,
          elapsedMs: input.elapsedMs,
        },
      });
    } catch {
      /* 运行数据写失败不应影响本次调用结果 */
    }
  }

  /** 取技能，失败即 404（带可读原因：坏技能与不存在要分开说） */
  private async require(id: string): Promise<SkillDescriptor> {
    const found = await this.catalog.find(id);
    if (found.ok) return found.skill;
    const missing = found.reason.includes('技能不存在');
    throw new HttpException(
      { code: missing ? 'skill-not-found' : 'skill-malformed', message: found.reason },
      missing ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  async run(
    id: string,
    input: { input: string; sessionId?: string | null; providerId?: string | null; modelId?: string },
  ): Promise<SkillRunAnswer> {
    const skill = await this.require(id);
    const text = input.input?.trim() ?? '';
    if (text.length < 2) {
      throw new HttpException(
        { code: 'invalid-input', message: 'input 至少 2 个字符' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const startedAt = Date.now();
    const modelId = input.modelId ?? skill.manifest.bindingExample.modelId;
    try {
      const answer: LlmChatResult = await this.llm.chat({
        providerId: input.providerId ?? skill.manifest.bindingExample.providerId,
        modelId,
        temperature: skill.manifest.model.params.temperature,
        maxTokens: skill.manifest.model.params.maxTokens,
        messages: [
          // 只喂正文：frontmatter 是元信息，喂进去模型会开始「扮演配置」
          { role: 'system', content: skill.systemPrompt },
          { role: 'user', content: text },
        ],
      });
      await this.recordRun({
        skillId: skill.manifest.id,
        skillVersion: skill.manifest.version,
        userInput: text,
        output: answer.text,
        model: answer.model,
        status: 'SUCCESS',
        errorCode: null,
        tokensPrompt: answer.usage.promptTokens,
        tokensCompletion: answer.usage.completionTokens,
        elapsedMs: answer.elapsedMs,
      });
      return {
        skillId: skill.manifest.id,
        skillVersion: skill.manifest.version,
        output: answer.text,
        model: answer.model,
        elapsedMs: answer.elapsedMs,
        usage: answer.usage,
      };
    } catch (error) {
      const mapped =
        error instanceof LlmError
          ? (LLM_FAILURE_HTTP[error.code] ?? {
              code: 'model-failed',
              status: HttpStatus.BAD_GATEWAY,
            })
          : { code: 'skill-run-failed', status: HttpStatus.INTERNAL_SERVER_ERROR };
      const message = error instanceof Error ? error.message : String(error);
      // 失败也进运行数据：不然「堆起来的数据」只统计成功，成功率恒为 100%
      await this.recordRun({
        skillId: skill.manifest.id,
        skillVersion: skill.manifest.version,
        userInput: text,
        output: message,
        model: modelId,
        status: 'FAILED',
        errorCode: mapped.code,
        tokensPrompt: 0,
        tokensCompletion: 0,
        elapsedMs: Date.now() - startedAt,
      });
      throw new HttpException({ code: mapped.code, message }, mapped.status);
    }
  }

  /** 一键导出的三种形态（同一份输入生成，保证不漂移） */
  async exportBundle(id: string, baseUrl: string): Promise<SkillExportBundle> {
    const skill = await this.require(id);
    const endpoint = { baseUrl, path: `/skills/${skill.manifest.id}/run` };
    const input = {
      manifest: skill.manifest,
      promptMarkdown: skill.promptMarkdown,
      cases: skill.cases as readonly SkillCase[],
      endpoint,
    };

    return {
      skill: {
        id: skill.manifest.id,
        name: skill.manifest.name,
        version: skill.manifest.version,
        dir: skill.dir,
      },
      integrationPrompt: buildIntegrationPrompt(input),
      interfaceData: buildInterfaceData(input),
      examples: buildCallExamples(input),
      pack: {
        'SKILL.md': skill.promptMarkdown,
        'skill.json': `${JSON.stringify(skill.manifest, null, 2)}\n`,
        ...(skill.manifest.cases
          ? { 'cases.json': `${JSON.stringify({ cases: skill.cases }, null, 2)}\n` }
          : {}),
        'integration-prompt.md': buildIntegrationPrompt(input),
        'binding.example.json': `${JSON.stringify(
          { providerId: skill.manifest.bindingExample.providerId, modelId: skill.manifest.bindingExample.modelId },
          null,
          2,
        )}\n`,
      },
    };
  }
}
