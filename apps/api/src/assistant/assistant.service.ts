/**
 * 助手用例 — 网关刚性层：限流/校验/落库都在这里，AI 只在 runner 里。
 * 与 intake 的差异（决策日志 2026-08-30）：存储失败不阻断回答——
 * 回答是产品本体，落库是观测；助手不消耗游客 intake 配额，仅按 IP 限流。
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  FEATURE_FAIL_CODES,
  RATE_LIMITS,
  isValidAssistantBody,
  type AssistantRunResult,
  type DegradeReason,
} from '@walker/shared';
import { newId } from '../common/ids';
import { rateLimited, validationError } from '../common/http-error';
import { APP_CONFIG, type AppConfigPort } from '../config/config.port';
import {
  ASSISTANT_REPOSITORY,
  type AssistantRepositoryPort,
} from '../ports/assistant.repository';
import {
  ASSISTANT_RUNNER,
  type AssistantRunnerPort,
} from '../ports/assistant-runner.port';
import { FEATURE_EVENT, type FeatureEventPort } from '../ports/feature-event.port';
import { RATE_LIMIT, type RateLimitPort } from '../ports/rate-limit.port';
import { RuleAssistantAdapter } from '../adapters/rule-assistant.adapter';

/** 全站每日 AI 请求预算（触顶当日自动降级规则兜底；env ASSISTANT_DAILY_LIMIT 可调） */
export const ASSISTANT_DAILY_LIMIT_DEFAULT = 200;

/** 站点时区（UTC+8）的当日日期串 */
function todayCN(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export interface AssistantAskServiceInput {
  body: string;
  source?: string;
  anonId: string;
  ipKey: string;
  sessionId?: string | null;
  isAuthenticated?: boolean;
  /** 端到端取消（流式）：浏览器断流时由控制器置 abort */
  signal?: AbortSignal;
}

export interface AssistantAskServiceResult {
  sessionId: string;
  answer: string;
  citations: { slug: string }[];
  aiUsedFlag: boolean;
  elapsedMs: number;
}

@Injectable()
export class AssistantService {
  private readonly dailyLimit: number;
  /**
   * 预算存储失效时的进程内兜底计数（fail-open 是既定决策，但兜底保证
   * 故障期间仍有软性成本上限；进程重启即重置，如实记录失效事件）
   */
  private budgetFallbackDate = '';
  private budgetFallbackCount = 0;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigPort,
    @Inject(ASSISTANT_RUNNER) private readonly runner: AssistantRunnerPort,
    @Inject(RuleAssistantAdapter)
    private readonly fallback: AssistantRunnerPort,
    @Inject(ASSISTANT_REPOSITORY) private readonly repo: AssistantRepositoryPort,
    @Inject(RATE_LIMIT) private readonly rateLimit: RateLimitPort,
    @Inject(FEATURE_EVENT) private readonly events: FeatureEventPort,
  ) {
    const n = Number(process.env.ASSISTANT_DAILY_LIMIT);
    this.dailyLimit =
      Number.isFinite(n) && n > 0 ? n : ASSISTANT_DAILY_LIMIT_DEFAULT;
  }

  async ask(
    input: AssistantAskServiceInput,
  ): Promise<AssistantAskServiceResult> {
    const gate = await this.preflight(input);
    const result = await this.dispatch(gate.askInput, gate.degradeReason);
    await this.settle(input, gate.actorType, result);
    return this.toResult(result);
  }

  /**
   * 流式变体：AI 且预算未触顶时走 askStream（text-delta 增量回调）；
   * 其余情形（AI 关/触顶/实现缺失/异常）非流式兜底，onText 一次性回调整体文本。
   */
  async askStream(
    input: AssistantAskServiceInput,
    onText: (delta: string) => void,
  ): Promise<AssistantAskServiceResult> {
    const gate = await this.preflight(input);
    let result: AssistantRunResult;
    if (!gate.degradeReason && this.runner.askStream) {
      try {
        result = await this.runner.askStream(gate.askInput, onText);
      } catch {
        // 流式路径异常：与适配器内部同口径标注，不掩盖原因
        result = {
          ...(await this.fallback.ask(gate.askInput)),
          degradeReason: 'runtime-error',
        };
        onText(result.answer);
      }
    } else {
      result = await this.dispatch(gate.askInput, gate.degradeReason);
      onText(result.answer);
    }
    await this.settle(input, gate.actorType, result);
    return this.toResult(result);
  }

  /** 网关前置：事件、限流、校验、预算判定（ask/askStream 共用） */
  private async preflight(input: AssistantAskServiceInput) {
    const actorType: 'guest' | 'user' = input.isAuthenticated ? 'user' : 'guest';
    void this.safeEvent({
      featureKey: 'assistant.ask',
      event: 'attempt',
      actorType,
    });

    const limit = input.isAuthenticated
      ? RATE_LIMITS.userPerWindow
      : RATE_LIMITS.guestPerWindow;
    if (
      !this.rateLimit.consume(
        `assistant:${input.ipKey}`,
        limit,
        RATE_LIMITS.windowSeconds,
      )
    ) {
      void this.safeEvent({
        featureKey: 'assistant.ask',
        event: 'fail',
        actorType,
        failCode: FEATURE_FAIL_CODES.rateLimited,
      });
      throw rateLimited();
    }

    if (!isValidAssistantBody(input.body)) {
      throw validationError('assistant-body-too-short');
    }

    // 会话归属校验：只有「已登记 + 属于当前访客 + harness 会话」才允许续轮；
    // 未知/他人/规则会话/存储不可用一律降级为新会话（fail-closed，不阻断提问）。
    // 拿到他人 sessionId 的访客无法续接或污染对方上下文。
    let sessionId: string | null = null;
    if (input.sessionId) {
      try {
        const owned = await this.repo.findSession(input.sessionId);
        if (owned && owned.anonId === input.anonId && owned.runner === 'harness') {
          sessionId = input.sessionId;
        }
      } catch {
        sessionId = null;
      }
    }

    const askInput = {
      sessionId,
      text: input.body.trim(),
      visitorKey: input.anonId,
      ...(input.signal ? { signal: input.signal } : {}),
    };

    // 每日 AI 预算熔断：触顶当日直接规则兜底（成本保险丝在网关，不指望模型自觉）
    // 观测 P1：网关级降级原因在此判定（开关 ai-disabled / 预算 budget-exceeded），随结果落库
    let degradeReason: DegradeReason | null = null;
    if (!this.config.isAiEnabled()) {
      degradeReason = 'ai-disabled';
    } else {
      const dateKey = todayCN();
      let used = 0;
      try {
        used = await this.repo.bumpRequests(dateKey);
      } catch {
        // 存储不可用时不阻断（fail-open），改用进程内兜底计数并如实记录失效
        if (this.budgetFallbackDate !== dateKey) {
          this.budgetFallbackDate = dateKey;
          this.budgetFallbackCount = 0;
        }
        this.budgetFallbackCount += 1;
        used = this.budgetFallbackCount;
        void this.safeEvent({
          featureKey: 'assistant.ask',
          event: 'fail',
          actorType,
          failCode: 'budget-storage-failed',
        });
      }
      if (used > this.dailyLimit) {
        void this.safeEvent({
          featureKey: 'assistant.ask',
          event: 'fail',
          actorType,
          failCode: 'budget-exceeded',
        });
        degradeReason = 'budget-exceeded';
      }
    }
    return { actorType, askInput, degradeReason };
  }

  /** 网关级降级（AI 关 / 预算触顶）直接走规则版并附原因；其余交给 runner 自行降级 */
  private async dispatch(
    askInput: { sessionId: string | null; text: string; visitorKey: string; signal?: AbortSignal },
    degradeReason: DegradeReason | null,
  ): Promise<AssistantRunResult> {
    if (degradeReason) {
      const result = await this.fallback.ask(askInput);
      return { ...result, degradeReason };
    }
    return this.runner.ask(askInput);
  }

  /** 观测性落库 + success 事件（ask/askStream 共用；失败不阻断回答） */
  private async settle(
    input: AssistantAskServiceInput,
    actorType: 'guest' | 'user',
    result: AssistantRunResult,
  ) {
    try {
      await this.repo.upsertSession({
        id: newId(),
        anonId: input.anonId,
        sessionId: result.sessionId,
        runner: result.aiUsedFlag ? 'harness' : 'rule',
      });
      await this.repo.saveRun({
        id: newId(),
        sessionId: result.sessionId,
        question: input.body.trim(),
        answer: result.answer,
        citations: JSON.stringify(result.citations.map((c) => c.slug)),
        aiUsedFlag: result.aiUsedFlag,
        elapsedMs: result.elapsedMs,
        traceId: null,
        source: input.source ?? 'assistant-panel',
        // 观测 P1：token / 首字 / 排队 / 降级原因（规则路径为 0 与 null）
        tokensIn: result.usage?.inputTokens ?? 0,
        tokensOut: result.usage?.outputTokens ?? 0,
        cacheReadTokens: result.usage?.cacheReadTokens ?? 0,
        firstChunkMs: result.firstChunkMs ?? null,
        queueWaitMs: result.queueWaitMs ?? null,
        degradeReason: result.degradeReason ?? null,
      });
      // 请求数已在 preflight 计入，这里只累加 token（避免二次计数请求）
      if (result.usage) {
        await this.repo.addTokens(todayCN(), {
          tokensIn: result.usage.inputTokens,
          tokensOut: result.usage.outputTokens,
        });
      }
    } catch {
      /* 存储不可用：回答已产出，优先返回 */
    }

    void this.safeEvent({
      featureKey: 'assistant.ask',
      event: 'success',
      actorType,
      props: {
        sessionId: result.sessionId,
        aiUsedFlag: result.aiUsedFlag,
        citations: result.citations.length,
        elapsedMs: result.elapsedMs,
      },
    });
  }

  private toResult(result: AssistantRunResult): AssistantAskServiceResult {
    return {
      sessionId: result.sessionId,
      answer: result.answer,
      citations: result.citations,
      aiUsedFlag: result.aiUsedFlag,
      elapsedMs: result.elapsedMs,
    };
  }

  private safeEvent(input: Omit<Parameters<FeatureEventPort['record']>[0], 'id'>) {
    return this.events.record({ ...input, id: newId() }).catch(() => {});
  }

  /** 管理侧：助手问题池（倒序，供站主筛选转题苗；AI 不参与筛选） */
  listRuns(limit = 50) {
    return this.repo.listRuns(limit);
  }
}
