/**
 * DshAgentRunner — AGENT_RUNNER 的 dsh 实现（卡口 nextStep + 工作站配方共用）。
 * 2026-09-06 定案（TODO-MAINLINE M2）：codex 线退役，单 dsh 运行时服务全部 AI 用例。
 *
 * 两种执行形态（M2 冒烟修正）：
 * - 短调用（调用方显式传 timeoutMs ≤ 60s，即卡口 nextStep 的 15s 预算）：复用
 *   **常驻实例**——per-run 冷启动可能吃满 15s 预算导致 AI 永远超时兜底，常驻实例
 *   把冷启动成本摊到进程生命周期；并发短调用经轻量锁串行（同一 JSON-RPC 连接）。
 * - 长调用（无 timeoutMs，即工作站配方，默认 10 分钟）：**独立实例跑完即关**，
 *   不与常驻实例和助手互相拖累；2C2G 并发 dsh 实例 ≤2（配方互斥 1 + 常驻 1 + 助手 1 属上限场景）。
 *
 * 语义与安全：站主面无规则兜底（失败如实抛错）；经 node + args 直启（无 shell），
 * prompt 走 JSON-RPC stdin，永不进命令行。
 */
import { Inject, Injectable } from '@nestjs/common';
import type { AgentRunInput, AgentRunResult, AgentRunnerPort } from '../ports/agent-runner.port';
import { APP_CONFIG, type AppConfigPort } from '../config/config.port';
import {
  buildDefaultRuntimeFactory,
  type HarnessRuntimeFactory,
  type HarnessRuntimeLike,
} from './harness-assistant.adapter';

/** 工作站阶段默认预算：配方单阶段最长 10 分钟（与原实现一致） */
export const DSH_STAGE_TIMEOUT_MS = 10 * 60 * 1000;

/** 短调用阈值：显式预算不超过它视为短调用（复用常驻实例） */
export const DSH_SHORT_CALL_MS = 60_000;

/**
 * 追加输出合同（仅工作站配方长调用使用）。ProductionService 的配方 prompt 没有自带
 * 输出格式指令，这里补上 JSON 契约。短调用（卡口 nextStep）的 prompt 自带合同
 * （buildAiNextStepPrompt），再追加会造成双合同冲突——实测把生成从 7s 拖到 45s+
 * （2026-09-06 生产 A/B 探针），15s 预算必然超时，因此短调用一律原样透传。
 */
export function withJsonOutputContract(prompt: string): string {
  return [
    prompt,
    '',
    '输出合同：只输出一个 JSON 对象，格式 {"recipeVersion":1,"stage":"<回传原 stage>","output":{…}}；不要输出任何其他文字。',
  ].join('\n');
}

type RunOutcome = { sessionId: string; finalResponse: unknown };

@Injectable()
export class DshAgentRunner implements AgentRunnerPort {
  private resident: HarnessRuntimeLike | null = null;
  private shortLock: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigPort,
    /** 测试注入假工厂用；生产经 kernel useFactory 构造，不参与 DI 解析 */
    private readonly runtimeFactory: HarnessRuntimeFactory | null = null,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    if (!this.config.isAiEnabled()) throw new Error('ai-disabled');
    const factory = this.runtimeFactory ?? buildDefaultRuntimeFactory();
    if (!factory) throw new Error('dsh-runtime-unavailable');

    const isShortCall =
      input.timeoutMs !== undefined && input.timeoutMs <= DSH_SHORT_CALL_MS;
    return isShortCall ? this.runResident(factory, input) : this.runIsolated(factory, input);
  }

  /** 短调用：常驻实例 + 轻量锁串行（同一 JSON-RPC 连接不并发） */
  private async runResident(
    factory: HarnessRuntimeFactory,
    input: AgentRunInput,
  ): Promise<AgentRunResult> {
    const prev = this.shortLock;
    let release!: () => void;
    this.shortLock = new Promise<void>((r) => {
      release = r;
    });
    await prev.catch(() => {});
    try {
      if (!this.resident) this.resident = factory();
      return await this.execute(this.resident, input, false);
    } catch (error) {
      // 常驻实例疑似失活：丢弃，下次短调用重拉（对齐助手 dropRuntime 策略）
      const dead = this.resident;
      this.resident = null;
      void dead?.close().catch(() => {});
      throw error;
    } finally {
      release();
    }
  }

  /** 长调用：独立实例，跑完即关 */
  private async runIsolated(
    factory: HarnessRuntimeFactory,
    input: AgentRunInput,
  ): Promise<AgentRunResult> {
    const runtime = factory();
    try {
      return await this.execute(runtime, input, true);
    } finally {
      void runtime.close().catch(() => {});
    }
  }

  private async execute(
    runtime: HarnessRuntimeLike,
    input: AgentRunInput,
    appendContract: boolean,
  ): Promise<AgentRunResult> {
    const started = Date.now();
    const prompt = appendContract ? withJsonOutputContract(input.prompt) : input.prompt;
    const runPromise: Promise<RunOutcome> = runtime.run(prompt, {});
    const timed = await Promise.race([
      runPromise,
      new Promise<null>((r) => setTimeout(() => r(null), input.timeoutMs ?? DSH_STAGE_TIMEOUT_MS)),
      ...(input.signal
        ? [new Promise<null>((r) => input.signal!.addEventListener('abort', () => r(null), { once: true }))]
        : []),
    ]);
    if (!timed) {
      runPromise.catch(() => {});
      throw new Error(input.signal?.aborted ? 'runner-aborted' : 'runner-timeout');
    }
    let output: unknown;
    try {
      output =
        typeof timed.finalResponse === 'string' ? JSON.parse(timed.finalResponse) : timed.finalResponse;
    } catch {
      throw new Error('runner-output-invalid-json');
    }
    return { output, rawEvents: [], elapsedMs: Date.now() - started };
  }
}
