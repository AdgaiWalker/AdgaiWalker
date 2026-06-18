/**
 * Walker AI Gateway — 统一 AI 调用网关
 *
 * 支持多服务商：
 * - DeepSeek（OpenAI 兼容格式）
 * - OpenAI
 * - Anthropic（Claude）
 * - 任意 OpenAI 兼容中转站
 *
 * 流程：Pretext → 敏感词检测 → API key 检查 → AI 调用 → 输出检测 → 日志
 */

import { checkSensitiveWords } from './sensitive';
import { buildPretext } from './pretext';
import { buildGatewayEndpoint } from './gateway-config';

export { checkSensitiveWords } from './sensitive';
export type { SensitiveCheckResult } from './sensitive';

// ===== Gateway 核心 =====

export type GatewayMode = 'ai' | 'fallback' | 'blocked';
export type FallbackReason = '' | 'missing_key' | 'network_error' | 'empty_result' | 'quota_exhausted' | 'sensitive_blocked' | 'sensitive_output' | 'timeout';

export interface GatewayCallLog {
  route: string;
  mode: GatewayMode;
  fallbackReason: FallbackReason;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  /** ISO 时间戳；持久化时由 logCall 写入（new Date().toISOString()），内存对象无此字段 */
  timestamp?: string;
}

export interface GatewayResponse<T> {
  data: T;
  mode: GatewayMode;
  fallbackReason: FallbackReason;
}

export interface GatewayInput {
  route: string;
  systemPrompt?: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  scenario?: import('./pretext').WalkerScenario;
}

/**
 * 统一 AI 调用网关
 */
export async function callGateway<T>(
  input: GatewayInput,
  fallback: T,
  parseResponse: (text: string) => T | null,
): Promise<GatewayResponse<T>> {
  const start = Date.now();

  // 0. 读取运行时配置
  const config = await getConfig();
  const apiKey = config.apiKey || import.meta.env.ANTHROPIC_API_KEY || '';

  // 1. Pretext
  const systemPrompt = input.systemPrompt ?? buildPretext({
    route: input.route,
    scenario: input.scenario,
    userPrompt: input.userPrompt,
  });

  // 2. 敏感词检测
  const inputCheck = checkSensitiveWords(input.userPrompt);
  if (inputCheck.hit) {
    await logCall({ route: input.route, mode: 'blocked', fallbackReason: 'sensitive_blocked', latencyMs: Date.now() - start });
    return { data: fallback, mode: 'blocked', fallbackReason: 'sensitive_blocked' };
  }

  // 3. API key 检查
  if (!apiKey) {
    await logCall({ route: input.route, mode: 'fallback', fallbackReason: 'missing_key', latencyMs: Date.now() - start });
    return { data: fallback, mode: 'fallback', fallbackReason: 'missing_key' };
  }

  // 4. AI 调用
  const timeoutMs = input.timeoutMs ?? config.timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = config.apiFormat === 'anthropic'
      ? await callAnthropic({ config, apiKey, systemPrompt, input, controller })
      : await callOpenAICompat({ config, apiKey, systemPrompt, input, controller });

    if (!response.ok) {
      await logCall({ route: input.route, mode: 'fallback', fallbackReason: 'network_error', latencyMs: Date.now() - start });
      return { data: fallback, mode: 'fallback', fallbackReason: 'network_error' };
    }

    const data = await response.json();

    // 提取文本（兼容两种格式）
    const text = extractText(data, config.apiFormat);
    if (!text) {
      await logCall({ route: input.route, mode: 'fallback', fallbackReason: 'empty_result', latencyMs: Date.now() - start });
      return { data: fallback, mode: 'fallback', fallbackReason: 'empty_result' };
    }

    // 5. 输出敏感词检测
    const outputCheck = checkSensitiveWords(text);
    if (outputCheck.hit) {
      await logCall({ route: input.route, mode: 'blocked', fallbackReason: 'sensitive_output', latencyMs: Date.now() - start });
      return { data: fallback, mode: 'blocked', fallbackReason: 'sensitive_output' };
    }

    // 6. 解析
    const parsed = parseResponse(text);
    if (!parsed) {
      await logCall({ route: input.route, mode: 'fallback', fallbackReason: 'empty_result', latencyMs: Date.now() - start });
      return { data: fallback, mode: 'fallback', fallbackReason: 'empty_result' };
    }

    // 7. 成功
    const usage = data.usage;
    const promptTokens = usage?.input_tokens || usage?.prompt_tokens;
    const completionTokens = usage?.output_tokens || usage?.completion_tokens;

    await logCall({
      route: input.route,
      mode: 'ai',
      fallbackReason: '',
      latencyMs: Date.now() - start,
      promptTokens,
      completionTokens,
    });

    return { data: parsed, mode: 'ai', fallbackReason: '' };
  } catch {
    const reason = controller.signal.aborted ? 'timeout' as FallbackReason : 'network_error' as FallbackReason;
    await logCall({ route: input.route, mode: 'fallback', fallbackReason: reason, latencyMs: Date.now() - start });
    return { data: fallback, mode: 'fallback', fallbackReason: reason };
  } finally {
    clearTimeout(timer);
  }
}

// ===== API 格式适配 =====

interface CallParams {
  config: import('./gateway-config').GatewayConfig;
  apiKey: string;
  systemPrompt: string;
  input: GatewayInput;
  controller: AbortController;
}

/** OpenAI 兼容格式（DeepSeek / 中转站 / OpenAI） */
async function callOpenAICompat(params: CallParams): Promise<Response> {
  const { config, apiKey, systemPrompt, input, controller } = params;
  const endpoint = buildGatewayEndpoint(config.baseUrl || '', 'openai-compat');

  return fetch(endpoint.attemptedUrl, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model ?? config.model,
      max_tokens: input.maxTokens ?? config.maxTokens,
      temperature: input.temperature ?? config.temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
    }),
  });
}

/** Anthropic 原生格式 */
async function callAnthropic(params: CallParams): Promise<Response> {
  const { config, apiKey, systemPrompt, input, controller } = params;
  const endpoint = buildGatewayEndpoint(config.baseUrl || 'https://api.anthropic.com', 'anthropic');

  return fetch(endpoint.attemptedUrl, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: input.model ?? config.model,
      max_tokens: input.maxTokens ?? config.maxTokens,
      temperature: input.temperature ?? config.temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: input.userPrompt }],
    }),
  });
}

/** 从不同格式的响应中提取文本 */
function extractText(data: any, apiFormat: string): string | null {
  if (apiFormat === 'anthropic') {
    // Anthropic: { content: [{ text: "..." }] }
    const text = data?.content?.[0]?.text;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  }
  // OpenAI 兼容: { choices: [{ message: { content: "..." } }] }
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

// ===== 配置读取 =====

async function getConfig(): Promise<import('./gateway-config').GatewayConfig> {
  try {
    const { getGatewayConfig } = await import('./gateway-config');
    return await getGatewayConfig();
  } catch {
    return {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-chat',
      apiFormat: 'openai-compat',
      maxTokens: 700,
      temperature: 0.3,
      timeoutMs: 10_000,
    };
  }
}

// ===== 调用日志 =====

import { getRedis } from '@/conversation/store';

const LOG_KEY = 'ai-gateway:logs';

async function logCall(log: GatewayCallLog): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.lpush(LOG_KEY, JSON.stringify({
      ...log,
      timestamp: new Date().toISOString(),
    }));
    await redis.ltrim(LOG_KEY, 0, 499);
    await redis.expire(LOG_KEY, 7 * 86_400);
  } catch {
    // 日志写入失败不影响业务
  }
}

/** 读取最近 AI 调用日志（管理员用） */
export async function readGatewayLogs(limit = 50): Promise<GatewayCallLog[]> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const raw = await redis.lrange<string>(LOG_KEY, 0, Math.max(0, limit - 1));
    return raw.map(r => {
      try { return JSON.parse(r) as GatewayCallLog; } catch { return null; }
    }).filter((r): r is GatewayCallLog => r !== null);
  } catch {
    return [];
  }
}
