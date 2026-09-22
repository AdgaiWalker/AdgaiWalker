/**
 * 大模型调用端口 —— 技能执行的**唯一**模型出口。
 *
 * 为什么要有这层：技能（AgentUnit）只声明「用哪个 provider / 哪个 model」，
 * 不关心 key 从哪来、报文长什么样。把「怎么调模型」收在一个端口后面，
 * 换来三件事：
 * 1. 执行路径可被测试（注入假实现即可，不必真联网）；
 * 2. 失败可分类（没配 key / 供应商拒绝 / 上游 5xx / 输出格式不对），
 *    每一类都能给出「谁的错、怎么修」，而不是一句 fetch failed；
 * 3. 换供应商（OpenAI 兼容 / harness / 其他 SDK）不动上层。
 *
 * 与 `apps/api/src/ports/code-health.port.ts` 同一纪律：分类错误 + 不返回空结构冒充成功。
 */

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlmChatRequest = {
  /** 供应商行 id；null/缺省时用默认供应商（当前为 `deepseek`） */
  providerId?: string | null;
  modelId: string;
  messages: readonly LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  /** 调用方超时预算；缺省用适配器默认值 */
  timeoutMs?: number;
};

export type LlmUsage = {
  promptTokens: number;
  completionTokens: number;
  /** 供应商报告的提示词缓存命中 tokens（不支持时为 0，**不编造**） */
  cacheHitTokens: number;
};

export type LlmChatResult = {
  text: string;
  /** 供应商实际回显的模型名（可能与请求不同，如实回传） */
  model: string;
  usage: LlmUsage;
  elapsedMs: number;
};

/** 失败分类：每一类都对应一句「谁的错、怎么修」 */
export type LlmErrorCode =
  /** 没有任何可用供应商（或指定 id 不存在）→ 去 admin 配置供应商 */
  | 'llm-no-provider'
  /** 供应商没配 API Key → 去 admin 填 Key */
  | 'llm-no-credential'
  /** 供应商拒绝鉴权（401/403）→ Key 错或过期 */
  | 'llm-auth-failed'
  /** 供应商返回 4xx（请求本身有问题：模型名不存在、超长…） */
  | 'llm-request-rejected'
  /** 供应商 5xx 或网络不可达 → 稍后重试 / 查网络 */
  | 'llm-upstream-failed'
  /** 到点没收完 → 调小输入或调大预算 */
  | 'llm-timeout'
  /** 回了但格式不对（缺 choices/content）→ 供应商兼容性问题 */
  | 'llm-bad-response';

export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'LlmError';
  }
}

export interface LlmClient {
  chat(request: LlmChatRequest): Promise<LlmChatResult>;
}

export const LLM_CLIENT = Symbol('LLM_CLIENT');
