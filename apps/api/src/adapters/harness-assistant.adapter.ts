/**
 * Harness 助手适配器 — 经 @deepseek-ai/dsh-sdk-client 驱动 dsh runtime（stdio JSON-RPC）。
 * 红线执行：
 * - AI_ENABLED≠true 直接走规则兜底（AI 可关，回答仍非空）
 * - 单飞并发（lock 1）：runtime 实例串行服务
 * - 15s 超时：弃结果走兜底，并关闭僵死 runtime，下一问自动重拉
 * - 输出必须过 parseAssistantOutput（citations ⊆ citable，fail-closed）
 *
 * 启动配方在 runtime/harness-launch.ts：访客会话目录、显式环境白名单、只读工具 patch。
 */
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  extractStreamedAnswer,
  diagnoseAssistantOutput,
  type AssistantRunResult,
  type DegradeReason,
} from '@walker/shared';
import type { AppConfigPort } from '../config/config.port';
import type {
  AssistantAskInput,
  AssistantRunnerPort,
} from '../ports/assistant-runner.port';
import type {
  SiteContentFullEntry,
  SiteContentIndexPort,
} from '../ports/site-content-index.port';
import { buildHarnessRuntimeFactory } from '../runtime/harness-launch';
import { readRuntimeUsage, textDelta } from './harness-runtime.adapter';
import { FsModelDirectory } from './fs-model-directory';
import { buildFirstTurnPrompt } from '../assistant/public-assistant-prompt';
export { buildFirstTurnPrompt } from '../assistant/public-assistant-prompt';

/** 站内助手对应的系统 Agent id（与 AgentUnit 的内置小影一致）。 */
const ASSISTANT_SYSTEM_AGENT_ID = 'xiaoying';

/** 访客同步等待预算；超时降级规则兜底（从入队起算，排队时间也计入） */
/**
 * 访客同步等待预算（默认 15s，保访客体验）。
 * harness 冷启动（spawn + 初始化 + 首 token）可能超此值 —— 站主自用场景
 * 可用 `WALKER_ASSISTANT_ASK_TIMEOUT_MS` 调大；低于 1s 的配置视为笔误，仍用默认。
 */
export const ASSISTANT_ASK_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.WALKER_ASSISTANT_ASK_TIMEOUT_MS?.trim());
  return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : 15_000;
})();

/** 排队容量：单飞锁下等待的后来者超过此数直接规则兜底，不让访客无限排队 */
export const ASSISTANT_MAX_QUEUE_WAITERS = 3;

/** 与 SDK RunResult 对齐的最小面（测试可注入假件）；onNotification 为流式钩子 */
export interface HarnessRuntimeLike {
  run(
    input: string,
    opts?: {
      sessionId?: string;
      onNotification?: (n: unknown) => void;
    },
  ): Promise<{ sessionId: string; finalResponse: unknown }>;
  close(): Promise<void>;
}

export type HarnessRuntimeFactory = () => HarnessRuntimeLike;

@Injectable()
export class HarnessAssistantAdapter
  implements AssistantRunnerPort, OnModuleDestroy
{
  private runtime: HarnessRuntimeLike | null = null;
  private factory: HarnessRuntimeFactory | null;
  /** 连续 timeout 次数：≥2 才认定实例僵死并重建（第一次可能是冷启动慢） */
  private timeoutStreak = 0;
  private lock: Promise<unknown> = Promise.resolve();
  /** 单飞锁下正在排队等待的请求数（队列容量熔断用） */
  private waiters = 0;

  constructor(
    private readonly config: AppConfigPort,
    private readonly index: SiteContentIndexPort,
    private readonly fallback: AssistantRunnerPort,
    runtimeFactory: HarnessRuntimeFactory | null = null,
    private readonly timeoutMs: number = ASSISTANT_ASK_TIMEOUT_MS,
  ) {
    this.factory = runtimeFactory;
  }

  async ask(input: AssistantAskInput): Promise<AssistantRunResult> {
    return this.runGuarded(input, undefined);
  }

  /**
   * 流式变体：text-delta 增量回调 onText（跳过 reasoning），终值仍走完整校验。
   * AI 关 / 无 runtime / 异常 → 非流式兜底（回调一次整体文本，保持前端契约统一）。
   */
  async askStream(
    input: AssistantAskInput,
    onText: (delta: string) => void,
  ): Promise<AssistantRunResult> {
    return this.runGuarded(input, onText);
  }

  private async runGuarded(
    input: AssistantAskInput,
    onText?: (delta: string) => void,
  ): Promise<AssistantRunResult> {
    if (!this.config.isAiEnabled()) return this.fallbackWith(input, 'ai-disabled');
    if (!this.factory) {
      // R26：站内助手也是「一个 Agent」，用它的独立 home（agents/xiaoying/），
      // 与用户创建的其他 Agent 同一套隔离规则——不留第二套目录约定。
      // 注意：该 home 首次启动时 dsh 会初始化它的 profile（含依赖安装），耗时较长，
      // 之后常驻复用（this.runtime 不随超时销毁）。
      this.factory = buildHarnessRuntimeFactory({
        audience: 'public',
        agentId: ASSISTANT_SYSTEM_AGENT_ID,
        modelDirectory: new FsModelDirectory(),
      }) as HarnessRuntimeFactory;
    }
    if (!this.factory) return this.fallbackWith(input, 'runtime-error');

    // 队列容量：单飞锁下等待者过多时不再排队，直接规则兜底
    if (this.waiters >= ASSISTANT_MAX_QUEUE_WAITERS) {
      return this.fallbackWith(input, 'queue-full');
    }

    // deadline 从入队起算：排队时间同样消耗访客的同步等待预算
    const enqueuedAt = Date.now();
    this.waiters += 1;
    const prev = this.lock;
    let release!: () => void;
    this.lock = new Promise<void>((r) => {
      release = r;
    });
    await prev.catch(() => {});
    this.waiters -= 1;
    const lockedAt = Date.now();

    const remainingMs = this.timeoutMs - (lockedAt - enqueuedAt);
    if (remainingMs <= 0) {
      release();
      return this.fallbackWith(input, 'queue-deadline');
    }
    if (input.signal?.aborted) {
      release();
      return this.fallbackWith(input, 'client-abort');
    }

    // 观测 P1：token 求和（step/end）与首字延迟（相对拿锁时刻，不含排队）
    let tokensIn = 0;
    let tokensOut = 0;
    let cacheReadTokens = 0;
    let firstChunkMs: number | undefined;

    try {
      if (!this.runtime) this.runtime = this.factory();
      let entries: SiteContentFullEntry[] = [];
      try {
        entries = await this.index.loadCitableFull();
      } catch {
        entries = [];
      }
      const citableSlugs = new Set(entries.map((e) => e.slug));
      const prompt = input.sessionId
        ? input.text
        : buildFirstTurnPrompt(entries, input.text);

      // 流式展示合同：text-delta 只在裁剪出「answer 字段已闭合文本」的新增部分时外发，
      // 原始模型 JSON（含 citations、语法噪声）绝不直接出网关；终值仍走完整校验。
      // rc.3 在 assistant/message 的 stream 和 usage 字段发增量与用量。
      let streamedBuffer = '';
      let visibleLength = 0;
      const onNotification = (raw: unknown) => {
        const delta = textDelta(raw);
        if (delta) {
          if (firstChunkMs === undefined) firstChunkMs = Date.now() - lockedAt;
          if (onText) {
            streamedBuffer += delta;
            const visible = extractStreamedAnswer(streamedBuffer);
            if (visible.length > visibleLength) {
              onText(visible.slice(visibleLength));
              visibleLength = visible.length;
            }
          }
        }
        const usage = readRuntimeUsage([raw]);
        if (usage) {
          tokensIn += usage.inputTokens;
          tokensOut += usage.outputTokens;
          cacheReadTokens += usage.cacheReadTokens ?? 0;
        }
      };

      const runPromise = this.runtime.run(prompt, {
        sessionId: input.sessionId ?? undefined,
        onNotification,
      });
      // 端到端取消：浏览器断流时网关 abort，视同超时处理（弃结果 + 重建实例）
      const abortPromise = input.signal
        ? new Promise<null>((r) => input.signal!.addEventListener('abort', () => r(null), { once: true }))
        : null;
      const timed = await Promise.race([
        runPromise,
        new Promise<null>((r) => setTimeout(() => r(null), remainingMs)),
        ...(abortPromise ? [abortPromise] : []),
      ]);
      if (!timed) {
        // 超时/取消：弃结果但**保留** runtime —— 冷启动可能比同步预算还贵，
        // 一次超时就杀实例会让「每次都冷启动 → 每次都超时」成死循环（线上实测如此）。
        // 连续两次超时才判定僵死并重建；成功即清零。abort 是用户主动行为，不计入。
        const reason: DegradeReason = input.signal?.aborted ? 'client-abort' : 'timeout';
        if (reason === 'timeout') this.timeoutStreak += 1;
        const dropping = reason === 'timeout' && this.timeoutStreak >= 2;
        console.error(
          `[assistant] 降级(${reason})：queued=${Date.now() - enqueuedAt}ms budget=${remainingMs}ms` +
            (dropping ? '（连续超时，丢弃实例）' : '（runtime 保留供复用）'),
        );
        runPromise.catch(() => {});
        if (dropping) {
          this.timeoutStreak = 0;
          this.dropRuntime();
        }
        return this.fallbackWith(input, reason);
      }
      // 用带诊断的校验：降级时必须说清「为什么没过」，否则线上只剩一句无法行动的话
      const diagnosis = diagnoseAssistantOutput(timed.finalResponse, citableSlugs);
      if (diagnosis.ok) this.timeoutStreak = 0;
      if (!diagnosis.ok) {
        console.error(
          `[assistant] 降级(bad-output)：${diagnosis.reason} · 原始输出前 200 字：${diagnosis.preview}`,
        );
        return this.fallbackWith(input, 'bad-output');
      }
      const parsed = diagnosis.value;
      return {
        answer: parsed.answer,
        citations: parsed.citations,
        sessionId: timed.sessionId,
        aiUsedFlag: true,
        elapsedMs: Date.now() - enqueuedAt,
        usage: { inputTokens: tokensIn, outputTokens: tokensOut, cacheReadTokens },
        firstChunkMs,
        queueWaitMs: lockedAt - enqueuedAt,
        degradeReason: null,
      };
    } catch (error) {
      // 传输断/协议错：丢弃实例，下一问重建（原因随 RunResult 落库，供可用率排查）
      console.error('[assistant] 降级(runtime)：', error instanceof Error ? error.message : error);
      this.dropRuntime();
      return this.fallbackWith(input, 'runtime-error');
    } finally {
      release();
    }
  }

  /** 降级统一出口：给规则兜底结果补上原因（rule adapter 保持纯净，不感知观测） */
  private async fallbackWith(
    input: AssistantAskInput,
    reason: DegradeReason,
  ): Promise<AssistantRunResult> {
    const result = await this.fallback.ask(input);
    return { ...result, degradeReason: reason };
  }

  private dropRuntime() {
    const dead = this.runtime;
    this.runtime = null;
    void dead?.close().catch(() => {});
  }

  async onModuleDestroy() {
    this.dropRuntime();
  }
}
