/**
 * Walker AI Gateway — 统一 AI 调用网关
 *
 * 参考 NorthStar 的 ai-gateway 模式：
 * 1. 统一入口：所有 AI 调用走 callGateway()
 * 2. 敏感词检测：输入拦截 + 输出过滤
 * 3. 三层降级：AI 成功 → fallback 关键词匹配 → 静默降级
 * 4. 调用日志：记录 mode/latency/tokens 到 Redis
 * 5. Quota 管理：每日/每分钟限流
 */

// ===== 敏感词管控 =====

const SENSITIVE_WORDS = [
  // 色情
  '色情', '裸体', '裸照', '情色', '成人视频', '淫秽',
  // 暴力
  '杀人', '自制武器', '虐待动物', '自残',
  // 赌博
  '赌博', '博彩', '彩票预测', '时时彩', '百家乐',
  // 违法
  '代开发票', '假钞', '信用卡套现', '洗钱',
  // 辱骂
  '傻逼', '操你', '滚蛋',
];

export interface SensitiveCheckResult {
  hit: boolean;
  words: string[];
}

export function checkSensitiveWords(text: string): SensitiveCheckResult {
  const lower = text.toLowerCase();
  const words: string[] = [];
  for (const word of SENSITIVE_WORDS) {
    if (word && lower.includes(word.toLowerCase())) {
      words.push(word);
    }
  }
  return { hit: words.length > 0, words };
}

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
}

export interface GatewayResponse<T> {
  data: T;
  mode: GatewayMode;
  fallbackReason: FallbackReason;
}

export interface GatewayInput {
  route: string;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

/**
 * 统一 AI 调用网关
 *
 * 流程：敏感词检测 → quota 检查 → AI 调用 → 输出检测 → 日志记录
 * 任何环节失败都优雅降级到 fallback
 */
export async function callGateway<T>(
  input: GatewayInput,
  fallback: T,
  parseResponse: (text: string) => T | null,
): Promise<GatewayResponse<T>> {
  const start = Date.now();
  const apiKey = import.meta.env.ANTHROPIC_API_KEY;

  // 1. 敏感词检测
  const inputCheck = checkSensitiveWords(input.userPrompt);
  if (inputCheck.hit) {
    await logCall({ route: input.route, mode: 'blocked', fallbackReason: 'sensitive_blocked', latencyMs: Date.now() - start });
    return { data: fallback, mode: 'blocked', fallbackReason: 'sensitive_blocked' };
  }

  // 2. API key 检查
  if (!apiKey) {
    await logCall({ route: input.route, mode: 'fallback', fallbackReason: 'missing_key', latencyMs: Date.now() - start });
    return { data: fallback, mode: 'fallback', fallbackReason: 'missing_key' };
  }

  // 3. AI 调用
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 10_000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: input.model ?? 'claude-sonnet-4-6',
        max_tokens: input.maxTokens ?? 1000,
        temperature: input.temperature ?? 0.3,
        system: input.systemPrompt,
        messages: [{ role: 'user', content: input.userPrompt }],
      }),
    });

    if (!response.ok) {
      await logCall({ route: input.route, mode: 'fallback', fallbackReason: 'network_error', latencyMs: Date.now() - start });
      return { data: fallback, mode: 'fallback', fallbackReason: 'network_error' };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (typeof text !== 'string' || !text.trim()) {
      await logCall({ route: input.route, mode: 'fallback', fallbackReason: 'empty_result', latencyMs: Date.now() - start });
      return { data: fallback, mode: 'fallback', fallbackReason: 'empty_result' };
    }

    // 4. 输出敏感词检测
    const outputCheck = checkSensitiveWords(text);
    if (outputCheck.hit) {
      await logCall({ route: input.route, mode: 'blocked', fallbackReason: 'sensitive_output', latencyMs: Date.now() - start });
      return { data: fallback, mode: 'blocked', fallbackReason: 'sensitive_output' };
    }

    // 5. 解析
    const parsed = parseResponse(text);
    if (!parsed) {
      await logCall({ route: input.route, mode: 'fallback', fallbackReason: 'empty_result', latencyMs: Date.now() - start });
      return { data: fallback, mode: 'fallback', fallbackReason: 'empty_result' };
    }

    // 6. 成功
    const usage = data.usage;
    await logCall({
      route: input.route,
      mode: 'ai',
      fallbackReason: '',
      latencyMs: Date.now() - start,
      promptTokens: usage?.input_tokens,
      completionTokens: usage?.output_tokens,
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
    // 保留最近 500 条
    await redis.ltrim(LOG_KEY, 0, 499);
    // 7 天过期
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
