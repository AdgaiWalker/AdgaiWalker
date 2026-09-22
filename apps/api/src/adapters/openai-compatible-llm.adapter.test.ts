/**
 * OpenAI 兼容适配器：请求形状 + 失败分类。
 *
 * 这里不联网：注入假 fetch，断言的是**契约**（报文长什么样、回执怎么映射、
 * 各类失败给出哪个码）。分类错一次，站主就会收到一句没法行动的
 * "fetch failed"，而正确分类会告诉他「去配 Key」。
 */
import { describe, expect, it } from 'vitest';
import { OpenAiCompatibleLlm, type LlmFetch } from './openai-compatible-llm.adapter';
import { LlmError } from '../ports/llm.port';
import type { ModelProviderService } from '../model-providers/model-provider.service';

const providerRow = {
  id: 'deepseek',
  name: 'DeepSeek 官方',
  category: 'official',
  enabled: true,
  baseUrl: 'https://api.deepseek.com/v1',
  apiFormat: 'openai-compatible',
  ciphertext: 'cipher',
  iv: 'iv',
  authTag: 'tag',
  last4: 'abcd',
  modelsJson: '[]',
  updatedAt: new Date(),
};

function adapterWith(options: {
  provider?: Partial<typeof providerRow> | null;
  apiKey?: string;
  fetchImpl?: LlmFetch;
}) {
  const provider = options.provider === null ? null : { ...providerRow, ...options.provider };
  const providers = {
    findById: async () => provider,
    getDecryptedApiKey: async () => options.apiKey ?? 'sk-test',
  } as unknown as ModelProviderService;
  const adapter = new OpenAiCompatibleLlm(providers);
  if (options.fetchImpl) adapter.fetchImpl = options.fetchImpl;
  return adapter;
}

/** 断言调用必然失败，并取出分类错误（避免 catch 回调把返回类型并成联合） */
async function llmErrorOf(promise: Promise<unknown>): Promise<LlmError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LlmError) return error;
    throw error;
  }
  throw new Error('预期调用失败，但它成功了');
}

const okFetch = (body: unknown, status = 200): LlmFetch =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as LlmFetch;

describe('请求形状', () => {
  it('POST {baseUrl}/chat/completions，带上 Bearer Key 与技能指定的模型', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const adapter = adapterWith({
      fetchImpl: (async (url: string, init: RequestInit) => {
        seenUrl = String(url);
        seenInit = init;
        return new Response(
          JSON.stringify({
            model: 'deepseek-chat',
            choices: [{ message: { content: '好的' } }],
            usage: { prompt_tokens: 10, completion_tokens: 2 },
          }),
          { status: 200 },
        );
      }) as unknown as LlmFetch,
    });

    const result = await adapter.chat({
      providerId: null,
      modelId: 'deepseek-chat',
      messages: [{ role: 'user', content: '你好' }],
    });

    expect(seenUrl).toBe('https://api.deepseek.com/v1/chat/completions');
    expect((seenInit?.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const sentBody = JSON.parse(String(seenInit?.body)) as Record<string, unknown>;
    expect(sentBody.model).toBe('deepseek-chat');
    expect(sentBody.stream).toBe(false);
    expect(result.text).toBe('好的');
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 2, cacheHitTokens: 0 });
  });

  it('回执缺 cache 命中字段时如实记 0，不编造命中率', async () => {
    const adapter = adapterWith({
      fetchImpl: okFetch({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 100, completion_tokens: 5 },
      }),
    });
    const result = await adapter.chat({ modelId: 'deepseek-chat', messages: [] });
    expect(result.usage.cacheHitTokens).toBe(0);
  });
});

describe('失败分类（每类都指向一个可执行的下一步）', () => {
  it('供应商不存在 → llm-no-provider', async () => {
    const adapter = adapterWith({ provider: null });
    await expect(adapter.chat({ modelId: 'm', messages: [] })).rejects.toMatchObject({
      code: 'llm-no-provider',
    });
  });

  it('供应商被停用 → llm-no-provider', async () => {
    const adapter = adapterWith({ provider: { enabled: false } });
    await expect(adapter.chat({ modelId: 'm', messages: [] })).rejects.toMatchObject({
      code: 'llm-no-provider',
    });
  });

  it('没配 Key → llm-no-credential（提示去后台填）', async () => {
    const adapter = adapterWith({
      provider: { ciphertext: '' },
      fetchImpl: async () => {
        throw new Error('不应该发起请求');
      },
    });
    const error = await llmErrorOf(adapter.chat({ modelId: 'm', messages: [] }));
    expect(error.code).toBe('llm-no-credential');
    expect(error.message).toContain('API Key');
  });

  it('401 → llm-auth-failed，并带上上游片段', async () => {
    const adapter = adapterWith({
      fetchImpl: okFetch({ error: { message: 'invalid api key' } }, 401),
    });
    const error = await llmErrorOf(adapter.chat({ modelId: 'm', messages: [] }));
    expect(error.code).toBe('llm-auth-failed');
    expect(error.message).toContain('invalid api key');
  });

  it('400 → llm-request-rejected（模型名写错之类，属请求问题）', async () => {
    const adapter = adapterWith({
      fetchImpl: okFetch({ error: { message: 'model not found' } }, 400),
    });
    await expect(adapter.chat({ modelId: 'm', messages: [] })).rejects.toMatchObject({
      code: 'llm-request-rejected',
    });
  });

  it('503 → llm-upstream-failed（供应商的问题，值得重试）', async () => {
    const adapter = adapterWith({ fetchImpl: okFetch({ error: 'boom' }, 503) });
    await expect(adapter.chat({ modelId: 'm', messages: [] })).rejects.toMatchObject({
      code: 'llm-upstream-failed',
    });
  });

  it('网络不可达 → llm-upstream-failed', async () => {
    const adapter = adapterWith({
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as LlmFetch,
    });
    const error = await llmErrorOf(adapter.chat({ modelId: 'm', messages: [] }));
    expect(error.code).toBe('llm-upstream-failed');
    expect(error.message).toContain('ECONNREFUSED');
  });

  it('超过预算未返回 → llm-timeout', async () => {
    const adapter = adapterWith({
      fetchImpl: (async () => {
        const abort = new Error('aborted');
        abort.name = 'AbortError';
        throw abort;
      }) as unknown as LlmFetch,
    });
    await expect(adapter.chat({ modelId: 'm', messages: [] })).rejects.toMatchObject({
      code: 'llm-timeout',
    });
  });

  it('回执格式不对（缺 choices[0].message.content）→ llm-bad-response', async () => {
    const adapter = adapterWith({ fetchImpl: okFetch({ choices: [] }) });
    await expect(adapter.chat({ modelId: 'm', messages: [] })).rejects.toMatchObject({
      code: 'llm-bad-response',
    });
  });
});
