/**
 * OpenAI 兼容的模型调用适配器 —— 技能的默认执行引擎。
 *
 * 为什么选它做默认：任何供应商都能对上一个 `POST {baseUrl}/chat/completions`，
 * 于是「换供应商」只是改一行配置，技能本体零改动（这是技能可迁移的前提）。
 * harness / 其他 SDK 属于可选引擎，走同一个 `LlmClient` 端口即可替换。
 *
 * 配置来源（R25c，2026-09-23）：**以 dsh 原生目录为唯一真相源**，不再读本地
 * ModelProvider 表。网址取自提供方条目的 baseURL，密钥按条目声明的 apiKeyRef
 * 从 dsh 凭据来源解析（只读引用名与值，不落库、不打印）。
 *
 * 三条纪律（对应一次评审修复的同类问题）：
 * 1. **不编造**：token 与耗时取自供应商回执，缓存命中不支持时就是 0；
 * 2. **失败分类**：没配 key / 鉴权失败 / 上游 5xx / 超时 / 格式不对，各有各的码；
 * 3. **不掩盖**：HTTP 非 2xx 时把上游响应片段带进错误信息，便于定位。
 */
import { Inject, Injectable } from '@nestjs/common';
import { findProvider, pickUsableProvider } from '@walker/shared';
import { MODEL_DIRECTORY, type ModelDirectoryPort } from '../ports/model-directory.port';
import { LlmError, type LlmChatRequest, type LlmChatResult, type LlmClient } from '../ports/llm.port';

/** 未指定提供方时，用 dsh 的默认提供方；取不到再落到已支持接口本身。 */
const FALLBACK_PROVIDER_ID = 'deepseek-official';
/** 默认超时：与助手的 60s 预算同一量级 */
const DEFAULT_TIMEOUT_MS = 60_000;

type ChatCompletionResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    /** DeepSeek 的缓存命中字段（OpenAI 无此项，故缺省 0） */
    prompt_cache_hit_tokens?: number;
  };
};

export type LlmFetch = typeof fetch;

@Injectable()
export class OpenAiCompatibleLlm implements LlmClient {
  /**
   * 可替换的 fetch（测试注入用）。做成字段而非构造参数：Nest 无法解析
   * 「函数类型」的构造依赖，写成参数会让容器在启动时报错。
   */
  fetchImpl: LlmFetch = fetch;

  // 显式 token：本仓 dev 走 tsx、测试走 vitest，**都不发 design:paramtypes 元数据**，
  // 按类型注入会拿到 undefined（生产 tsc 编译才有元数据）。一律 @Inject，三处同语义。
  constructor(@Inject(MODEL_DIRECTORY) private readonly directory: ModelDirectoryPort) {}

  async chat(request: LlmChatRequest): Promise<LlmChatResult> {
    const snapshot = this.directory.snapshot();
    const requested = request.providerId?.trim();
    // 显式指定时严格按它查（找不到就报错，不静默换）。
    // 未指定时用「目录里确实可用的」提供方：dsh 的 agent-default-model 可能指向
    // 本运行时装不上的插件（如桌面版专有的 workbuddy），盲信它会让可用通道也一起失败。
    const provider = requested
      ? findProvider(snapshot, requested)
      : (pickUsableProvider(snapshot)?.provider ?? findProvider(snapshot, FALLBACK_PROVIDER_ID));
    if (!provider) {
      throw new LlmError(
        'llm-no-provider',
        `提供方「${requested ?? snapshot.defaultProvider ?? FALLBACK_PROVIDER_ID}」不在 dsh 目录中；请在 dsh 设置里声明该接口`,
      );
    }

    // 凭据值只从 dsh 凭据来源解析，不落库、不进日志。
    const apiKey = this.directory.credentialValue(provider.apiKeyRef) ?? '';
    if (!apiKey) {
      throw new LlmError(
        'llm-no-credential',
        `提供方「${provider.id}」的凭据引用 ${provider.apiKeyRef} 没有值；请在 dsh 设置里配置`,
      );
    }

    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();

    let response: Response;
    try {
      response = await this.fetchImpl(
        `${provider.baseURL.replace(/\/+$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: request.modelId,
            messages: request.messages,
            temperature: request.temperature,
            max_tokens: request.maxTokens,
            stream: false,
          }),
          signal: controller.signal,
        },
      );
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      throw new LlmError(
        aborted ? 'llm-timeout' : 'llm-upstream-failed',
        aborted
          ? `模型调用超过 ${timeoutMs}ms 未返回`
          : `无法连接提供方（${provider.baseURL}）：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    const elapsedMs = Date.now() - started;

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const snippet = detail.slice(0, 300);
      if (response.status === 401 || response.status === 403) {
        throw new LlmError('llm-auth-failed', `供应商拒绝鉴权（${response.status}）：${snippet}`);
      }
      if (response.status >= 500) {
        throw new LlmError('llm-upstream-failed', `供应商错误（${response.status}）：${snippet}`);
      }
      throw new LlmError('llm-request-rejected', `请求被拒绝（${response.status}）：${snippet}`);
    }

    let payload: ChatCompletionResponse;
    try {
      payload = (await response.json()) as ChatCompletionResponse;
    } catch (error) {
      throw new LlmError(
        'llm-bad-response',
        `供应商返回的不是 JSON：${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new LlmError('llm-bad-response', '供应商返回缺少 choices[0].message.content');
    }

    return {
      text,
      model: payload.model ?? request.modelId,
      usage: {
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
        cacheHitTokens: payload.usage?.prompt_cache_hit_tokens ?? 0,
      },
      elapsedMs,
    };
  }
}
