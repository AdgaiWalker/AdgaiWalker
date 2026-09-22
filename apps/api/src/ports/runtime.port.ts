/**
 * 模型运行端口。只返回一次调用的文本、用量和会话归属。
 * 终态、发布和问答是否合格由调用方判断。
 */
export const RUNTIME_PORT = Symbol('RUNTIME_PORT');

export interface RuntimeOwner {
  visitorKey: string;
  agentRevisionId: string;
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
  start(): Promise<void>;
  run(request: RuntimeRunRequest): Promise<RuntimeRunResult>;
  observe(listener: (event: RuntimeEvent) => void): () => void;
  close(): Promise<RuntimeExitProof>;
}
