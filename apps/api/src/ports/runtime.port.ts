/**
 * 模型运行端口。只返回一次调用的文本、用量和会话归属。
 * 终态、发布和问答是否合格由调用方判断。
 */
export const RUNTIME_PORT = Symbol('RUNTIME_PORT');

export interface RuntimeOwner {
  visitorKey: string;
  agentRevisionId: string;
  /**
   * 该运行属于哪个 Agent（R26）：给定则运行时用这个 Agent 自己的独立 home
   * （`agents/<agentId>/`），配置、插件与会话互不串；缺省回落到受众级目录。
   */
  agentId?: string | null;
  /** Immutable revision's model selection. */
  providerId?: string | null;
  modelId?: string | null;
  /**
   * 该 Agent 修订的系统提示词（R32）。
   *
   * 为什么放在 owner：提示词是**修订级配置**，与 agentRevisionId 同源。
   * dsh 没有 SDK 层的 system 字段（协议写明 prompt 是 "sent verbatim as the user message"），
   * 所以由运行时把它写进该 Agent home 的 system-prompt persona（见 harness-launch）。
   * 不传 = 用 dsh 默认人格（受众级/未配提示词的场景）。
   */
  systemPrompt?: string | null;
}

export interface RuntimeUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number | null;
}

export type RuntimeOutputKind = 'json' | 'bad-json' | 'duplicate-contract';

export type RuntimeFailure =
  | 'transport-closed'
  | 'protocol-error'
  | 'timeout'
  | 'busy'
  | 'session-owner-mismatch'
  | 'version-mismatch'
  | 'duplicate-contract'
  | 'runtime-error';

export interface RuntimeEvent {
  kind: 'text' | 'usage';
  text?: string;
  usage?: RuntimeUsage | null;
}

export interface RuntimeRunRequest {
  prompt: string;
  owner: RuntimeOwner;
  sessionId?: string | null;
  /** Persisted SDK session cannot be trusted after a runtime restart. Use this complete prompt when opening a fresh session. */
  freshPrompt?: string;
  onSessionResource?: (resource: {
    sessionId: string;
    kind: 'native-session' | 'native-fork';
    parentSessionId?: string | null;
  }) => Promise<void>;
  /** 调用方要附加的唯一输出合同。prompt 里已经有同一段时不再追加。 */
  outputContract?: string;
  observe?: (event: RuntimeEvent) => void;
}

export type RuntimeRunResult =
  | {
      ok: true;
      sessionId: string;
      text: string;
      json: unknown | null;
      usage: RuntimeUsage | null;
      outputKind: RuntimeOutputKind;
    }
  | {
      ok: false;
      failure: RuntimeFailure;
      sessionId: string | null;
    };

/** close 正常返回才表示进程已经退出。调用本身不是退出证明。 */
export interface RuntimeExitProof {
  exited: boolean;
}

export interface RuntimePort {
  start(owner?: RuntimeOwner): Promise<void>;
  run(request: RuntimeRunRequest): Promise<RuntimeRunResult>;
  observe(listener: (event: RuntimeEvent) => void): () => void;
  close(): Promise<RuntimeExitProof>;
}
