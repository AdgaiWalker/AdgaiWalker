/**
 * 助手运行器端口：网关只依赖本接口，实现可换（规则兜底 / harness AI）。
 * 会话由首次 ask 自然产生，返回的 sessionId 供后续多轮复用；
 * 实现方自行持有会话真相（harness 侧 / 规则侧无状态）。
 */
import type { AssistantRunResult } from '@walker/shared';

export interface AssistantAskInput {
  /** null 表示新会话；非空为上一轮返回的会话标识 */
  sessionId: string | null;
  text: string;
  /** 访客标识（anon-id），供实现方做会话命名与审计 */
  visitorKey: string;
}

export interface AssistantRunnerPort {
  ask(input: AssistantAskInput): Promise<AssistantRunResult>;
  /** 可选流式实现：增量回调 onText，终值仍走 Run 合同；未实现时调用方回落 ask */
  askStream?(
    input: AssistantAskInput,
    onText: (delta: string) => void,
  ): Promise<AssistantRunResult>;
}

export const ASSISTANT_RUNNER = Symbol('ASSISTANT_RUNNER');
