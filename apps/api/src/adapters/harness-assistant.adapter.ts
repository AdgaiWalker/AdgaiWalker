/**
 * Harness 助手适配器 — 经 @deepseek-ai/dsh-sdk-client 驱动 dsh runtime（stdio JSON-RPC）。
 * 红线执行：
 * - AI_ENABLED≠true 直接走规则兜底（AI 可关，回答仍非空）
 * - 单飞并发（lock 1）：runtime 实例串行服务
 * - 15s 超时：弃结果走兜底，并关闭僵死 runtime，下一问自动重拉
 * - 输出必须过 parseAssistantOutput（citations ⊆ citable，fail-closed）
 *
 * 启动配方（2026-08-30 实测通过，见 docs/TODO-SITE-ASSISTANT.md 决策日志）：
 * clone 的 bin.ts 经 tsx 启动，cwd 必须指 clone 目录（避免宿主仓库的
 * 依赖解析污染）；DSH_HOME 独立于开发者 ~/.dsh；DSH_PERMISSION_MODE=read-only。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client';
import {
  parseAssistantOutput,
  type AssistantRunResult,
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

/** 访客同步等待预算；超时降级规则兜底 */
export const ASSISTANT_ASK_TIMEOUT_MS = 15_000;

/** 与 SDK RunResult 对齐的最小面（测试可注入假件） */
export interface HarnessRuntimeLike {
  run(
    input: string,
    opts?: { sessionId?: string },
  ): Promise<{ sessionId: string; finalResponse: unknown }>;
  close(): Promise<void>;
}

export type HarnessRuntimeFactory = () => HarnessRuntimeLike;

export function resolveRuntimePaths(): { bin: string; cwd: string } | null {
  const fromEnv = process.env.DSH_RUNTIME_DIR?.trim();
  const dir = fromEnv || path.join(os.homedir(), 'Desktop/deepseek-harness');
  const bin = path.join(dir, 'apps/cli/src/bin.ts');
  if (!fs.existsSync(bin)) return null;
  return { bin, cwd: dir };
}

export function buildDefaultRuntimeFactory(
  provider = 'deepseek-official',
  model = 'deepseek-v4-flash',
): HarnessRuntimeFactory | null {
  // 助手专用环境：DSH_HOME 独立目录；子进程 cwd 必须是中立目录（dsh 启动时
  // 会扫描 cwd 的 .env 并拒绝其中出现的 DSH_* 启动变量，见探针 2026-09-03）
  const dshHome =
    process.env.ASSISTANT_DSH_HOME?.trim() ||
    path.join(os.homedir(), '.dsh-assistant');
  const childEnv = {
    ...process.env,
    DSH_HOME: dshHome,
    DSH_PERMISSION_MODE: 'read-only',
  };
  // 优先：WALKER_DSH_RUNTIME_BIN 指向已构建的 dsh bin（生产/盒子 npm 安装形态）
  const binOverride = process.env.WALKER_DSH_RUNTIME_BIN?.trim();
  if (binOverride) {
    return () =>
      new DeepSeekHarness({
        cwd: dshHome,
        provider,
        model,
        launch: {
          command: process.execPath,
          args: [binOverride, '--profile', 'sdk'],
          cwd: dshHome,
          env: childEnv,
          requestTimeoutMs: 60_000,
        },
      }) as unknown as HarnessRuntimeLike;
  }
  // 默认（本地开发）：clone 源码经 tsx 启动，cwd 必须指 clone 目录
  const paths = resolveRuntimePaths();
  if (!paths) return null;
  return () =>
    new DeepSeekHarness({
      cwd: paths.cwd,
      provider,
      model,
      launch: {
        command: process.execPath,
        args: ['--import', 'tsx/esm', paths.bin, '--profile', 'sdk'],
        cwd: paths.cwd,
        env: childEnv,
        requestTimeoutMs: 60_000,
      },
    }) as unknown as HarnessRuntimeLike;
}

/** 会话首条消息：人设 + 整库资料 + 输出契约 */
export function buildFirstTurnPrompt(
  entries: readonly SiteContentFullEntry[],
  question: string,
): string {
  const pack = entries.map(
    (e) =>
      `- slug: ${e.slug}｜标题: ${e.title}${e.tags.length ? `｜标签: ${e.tags.join(' ')}` : ''}\n${e.body}`,
  );
  return [
    '你是小影，个人站 Walker（iwalk.pro）站主 duola 的管家，替他接待访客。',
    '表达规则：',
    '1. 以第三人称介绍 duola 与这个站（「duola 他…」「这个站…」）；仅当引用他文章原话时，才用引号加第一人称引述。',
    '2. 只依据下方「站点资料」回答；资料里没有的就直接承认不知道，不要编造。',
    '3. 回答口语化、具体，控制在 300 字以内。',
    '4. 如果访客的问题是「想做成某事但卡住了」这类行动问题，简短回应后引导去 /tools 用卡口拿下一步。',
    '5. 每次只输出一个 JSON 对象，不要输出任何其他内容：{"answer":"...","citations":["slug",...]}',
    '6. citations 只能从资料列出的 slug 中选，最多 3 个，没有相关就给空数组。',
    '站点资料（只有这些可引用）：',
    ...pack,
    `访客问题：${question}`,
  ].join('\n');
}

@Injectable()
export class HarnessAssistantAdapter
  implements AssistantRunnerPort, OnModuleDestroy
{
  private runtime: HarnessRuntimeLike | null = null;
  private factory: HarnessRuntimeFactory | null;
  private lock: Promise<unknown> = Promise.resolve();

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
    if (!this.config.isAiEnabled()) return this.fallback.ask(input);
    if (!this.factory) this.factory = buildDefaultRuntimeFactory();
    if (!this.factory) return this.fallback.ask(input);

    // 单飞：同一时刻只有一个 runtime 活动
    const prev = this.lock;
    let release!: () => void;
    this.lock = new Promise<void>((r) => {
      release = r;
    });
    await prev.catch(() => {});

    const started = Date.now();
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

      const runPromise = this.runtime.run(prompt, {
        sessionId: input.sessionId ?? undefined,
      });
      const timed = await Promise.race([
        runPromise,
        new Promise<null>((r) => setTimeout(() => r(null), this.timeoutMs)),
      ]);
      if (!timed) {
        // 超时：吞掉迟到结果的拒绝，弃结果；关掉可能僵死的 runtime，下一问重拉新实例
        runPromise.catch(() => {});
        this.dropRuntime();
        return this.fallback.ask(input);
      }
      const parsed = parseAssistantOutput(timed.finalResponse, citableSlugs);
      if (!parsed) return this.fallback.ask(input);
      return {
        answer: parsed.answer,
        citations: parsed.citations,
        sessionId: timed.sessionId,
        aiUsedFlag: true,
        elapsedMs: Date.now() - started,
      };
    } catch {
      // 传输断/协议错：丢弃实例，下一问重建
      this.dropRuntime();
      return this.fallback.ask(input);
    } finally {
      release();
    }
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
