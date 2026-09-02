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
  saveRun(input: AssistantRunInput): Promise<void>;
  /** 问题池：倒序最近记录（管理侧筛选用，AI 不参与） */
  listRuns(limit: number): Promise<AssistantRunRecord[]>;
  /** 当日 AI 请求数 +1 并返回累计值（预算熔断用；存储失败由调用方处理） */
  bumpRequests(date: string): Promise<number>;
}

export const ASSISTANT_REPOSITORY = Symbol('ASSISTANT_REPOSITORY');
