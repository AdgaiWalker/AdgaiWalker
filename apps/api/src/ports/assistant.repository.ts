/** 助手会话与运行记录仓储（业务真相；执行真相在 harness 侧，不复制） */

export interface AssistantSessionInput {
  id: string;
  anonId: string;
  sessionId: string;
  runner: string;
}

export interface AssistantRunInput {
  id: string;
  sessionId: string;
  question: string;
  answer: string;
  citations: string;
  aiUsedFlag: boolean;
  elapsedMs: number;
  traceId?: string | null;
  source: string;
  /** 观测 P1：token 用量（缺失记 0，不记 null） */
  tokensIn?: number;
  tokensOut?: number;
  cacheReadTokens?: number;
  /** 观测 P1：拿锁 → 首字 / 排队等待（规则路径可为空） */
  firstChunkMs?: number | null;
  queueWaitMs?: number | null;
  /** 观测 P1：降级原因（kebab 词表；正常 AI 回答为 null） */
  degradeReason?: string | null;
}

export interface AssistantRunRecord {
  id: string;
  sessionId: string;
  question: string;
  answer: string;
  citations: string[];
  aiUsedFlag: boolean;
  elapsedMs: number;
  source: string;
  createdAt: string;
}

export interface AssistantRepositoryPort {
  upsertSession(input: AssistantSessionInput): Promise<void>;
  /** 会话归属查询：网关续轮前校验 sessionId 属于当前访客（隐私边界） */
  findSession(sessionId: string): Promise<{ anonId: string; runner: string } | null>;
  saveRun(input: AssistantRunInput): Promise<void>;
  /** 问题池：倒序最近记录（管理侧筛选用，AI 不参与） */
  listRuns(limit: number): Promise<AssistantRunRecord[]>;
  /**
   * 当日 AI 请求数 +1（可同时累加 token）并返回累计请求数。
   * 预算熔断用；存储失败由调用方处理。
   */
  bumpRequests(
    date: string,
    usage?: { tokensIn: number; tokensOut: number },
  ): Promise<number>;
  /**
   * 只累加 token，不加请求数。
   * 请求数在 preflight 已计入，回答结束后再记 token 时不能二次计数请求。
   */
  addTokens(
    date: string,
    usage: { tokensIn: number; tokensOut: number },
  ): Promise<void>;
}

export const ASSISTANT_REPOSITORY = Symbol('ASSISTANT_REPOSITORY');
