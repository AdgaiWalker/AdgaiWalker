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
    const actorType = input.isAuthenticated ? 'user' : 'guest';
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

    const askInput = {
      sessionId: input.sessionId ?? null,
      text: input.body.trim(),
      visitorKey: input.anonId,
    };

    // 每日 AI 预算熔断：触顶当日直接规则兜底（成本保险丝在网关，不指望模型自觉）
    let result: AssistantRunResult;
    if (this.config.isAiEnabled()) {
      let used = 0;
      try {
        used = await this.repo.bumpRequests(todayCN());
      } catch {
        used = 0; // 存储不可用时不阻断（fail-open），照常走 AI
      }
      if (used > this.dailyLimit) {
        void this.safeEvent({
          featureKey: 'assistant.ask',
          event: 'fail',
          actorType,
          failCode: 'budget-exceeded',
        });
        result = await this.fallback.ask(askInput);
      } else {
        result = await this.runner.ask(askInput);
      }
    } else {
      result = await this.runner.ask(askInput);
    }

    // 观测性落库：失败不阻断回答
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
      });
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
