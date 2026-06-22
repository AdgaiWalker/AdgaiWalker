/**
 * AI Gateway 配置管理
 *
 * 支持多服务商、自定义 API 地址和模型名。
 * 配置存在 Redis，运行时可切换，不需要重新部署。
 * 本地开发无 Redis 时自动降级到内存存储。
 *
 * Key: ai-gateway:config (hash)
 */

import { getRedis } from '@/stores/redis-client';

// ===== 服务商预设 =====

export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  /** API 格式：openai-compat 或 anthropic */
  apiFormat: 'openai-compat' | 'anthropic';
  models: { id: string; name: string }[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiFormat: 'openai-compat',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    apiFormat: 'openai-compat',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com',
    apiFormat: 'anthropic',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
    ],
  },
  {
    id: 'custom',
    name: '自定义 (OpenAI 兼容)',
    baseUrl: '',
    apiFormat: 'openai-compat',
    models: [],
  },
];

// ===== 配置结构 =====

export interface GatewayConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiFormat: 'openai-compat' | 'anthropic';
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}

export interface GatewayEndpointPreview {
  attemptedUrl: string;
  normalizedBaseUrl: string;
  path: string;
  warning?: string;
}

const CONFIG_KEY = 'ai-gateway:config';

const DEFAULT_CONFIG: GatewayConfig = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
  apiFormat: 'openai-compat',
  maxTokens: 700,
  temperature: 0.3,
  timeoutMs: 10_000,
};

// ===== Endpoint 归一化 =====

function cleanBaseUrl(rawBaseUrl: string): string {
  return rawBaseUrl.trim().replace(/\/+$/, '');
}

function normalizePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized === '/' ? '' : normalized;
}

export function buildGatewayEndpoint(
  rawBaseUrl: string,
  apiFormat: GatewayConfig['apiFormat'] = 'openai-compat',
): GatewayEndpointPreview {
  const cleaned = cleanBaseUrl(rawBaseUrl);
  const targetPath = apiFormat === 'anthropic' ? '/v1/messages' : '/v1/chat/completions';
  const targetSuffix = apiFormat === 'anthropic' ? '/messages' : '/chat/completions';

  if (!cleaned) {
    return {
      attemptedUrl: targetPath,
      normalizedBaseUrl: '',
      path: targetPath,
    };
  }

  try {
    const url = new URL(cleaned);
    const path = normalizePath(url.pathname);
    const lowerPath = path.toLowerCase();
    const lowerTarget = targetPath.toLowerCase();
    let endpointPath = path;
    let warning: string | undefined;

    if (lowerPath.endsWith(lowerTarget)) {
      endpointPath = path;
    } else if (lowerPath.endsWith('/v1')) {
      endpointPath = `${path}${targetSuffix}`;
    } else {
      endpointPath = `${path}${targetPath}`;
    }

    if (lowerPath.includes('/v1/v1')) {
      warning = '检测到 API 地址可能重复包含 /v1，系统已按目标接口重新拼接。';
    }

    url.pathname = endpointPath.replace(/\/{2,}/g, '/');
    url.search = '';
    url.hash = '';

    return {
      attemptedUrl: url.toString().replace(/\/$/, ''),
      normalizedBaseUrl: cleaned,
      path: url.pathname,
      warning,
    };
  } catch {
    const attemptedUrl = `${cleaned}${targetPath}`;
    return {
      attemptedUrl,
      normalizedBaseUrl: cleaned,
      path: targetPath,
      warning: 'API 地址格式可能不正确，请确认包含 https://。',
    };
  }
}

// ===== 内存降级存储 + 本地文件持久化 =====

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LOCAL_CONFIG_FILE = join(process.cwd(), '.gateway-config.json');

let memoryConfig: GatewayConfig | null = null;
const memoryHistory: Array<GatewayConfig & { savedAt: string }> = [];

/** 无 Redis 时从本地文件读配置 */
function readLocalConfig(): GatewayConfig | null {
  try {
    if (existsSync(LOCAL_CONFIG_FILE)) {
      const raw = readFileSync(LOCAL_CONFIG_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch { /* ignore */ }
  return null;
}

/** 无 Redis 时把配置写到本地文件 */
function writeLocalConfig(config: GatewayConfig): void {
  try {
    writeFileSync(LOCAL_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch { /* ignore */ }
}

// ===== 读取配置 =====

export async function getGatewayConfig(): Promise<GatewayConfig> {
  const redis = getRedis();

  if (!redis) {
    if (memoryConfig) return memoryConfig;
    const local = readLocalConfig();
    if (local) { memoryConfig = local; return local; }
    return DEFAULT_CONFIG;
  }

  try {
    const stored = await redis.hgetall<Record<string, string>>(CONFIG_KEY);
    if (!stored || !stored.provider) return DEFAULT_CONFIG;

    return {
      provider: stored.provider,
      baseUrl: stored.baseUrl,
      apiKey: stored.apiKey,
      model: stored.model,
      apiFormat: (stored.apiFormat === 'anthropic' ? 'anthropic' : 'openai-compat') as GatewayConfig['apiFormat'],
      maxTokens: Number(stored.maxTokens) || DEFAULT_CONFIG.maxTokens,
      temperature: Number(stored.temperature) || DEFAULT_CONFIG.temperature,
      timeoutMs: Number(stored.timeoutMs) || DEFAULT_CONFIG.timeoutMs,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// ===== 写入配置（带历史记录） =====

async function writeConfig(config: GatewayConfig): Promise<void> {
  memoryConfig = config;

  // 无 Redis 时持久化到本地文件
  const redis = getRedis();
  if (!redis) {
    writeLocalConfig(config);
    return;
  }

  try {
    await redis.hset(CONFIG_KEY, {
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      apiFormat: config.apiFormat,
      maxTokens: String(config.maxTokens),
      temperature: String(config.temperature),
      timeoutMs: String(config.timeoutMs),
    });
  } catch {
    // Redis 写失败，内存已更新，继续
  }
}

async function saveHistory(config: GatewayConfig): Promise<void> {
  const entry = { ...config, savedAt: new Date().toISOString() };
  memoryHistory.unshift(entry);
  if (memoryHistory.length > 10) memoryHistory.length = 10;

  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.lpush('ai-gateway:config-history', JSON.stringify(entry));
    await redis.ltrim('ai-gateway:config-history', 0, 9);
  } catch {
    // 历史保存失败不影响主流程
  }
}

// ===== 更新配置 =====

export async function updateGatewayConfig(partial: Partial<GatewayConfig>): Promise<GatewayConfig> {
  const current = await getGatewayConfig();

  // 保存当前配置到历史（撤销用）
  await saveHistory(current);

  const updated: GatewayConfig = {
    provider: partial.provider ?? current.provider,
    baseUrl: partial.baseUrl ?? current.baseUrl,
    apiKey: partial.apiKey ?? current.apiKey,
    model: partial.model ?? current.model,
    apiFormat: partial.apiFormat ?? current.apiFormat,
    maxTokens: partial.maxTokens ?? current.maxTokens,
    temperature: partial.temperature ?? current.temperature,
    timeoutMs: partial.timeoutMs ?? current.timeoutMs,
  };

  await writeConfig(updated);
  return updated;
}

// ===== 撤销 =====

export async function undoGatewayConfig(): Promise<GatewayConfig | null> {
  // 先尝试 Redis 历史
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.lpop<string>('ai-gateway:config-history');
      if (raw) {
        const previous = JSON.parse(raw);
        delete previous.savedAt;
        await writeConfig(previous);
        return previous as GatewayConfig;
      }
    } catch {
      // fall through to memory
    }
  }

  // 降级到内存历史
  if (memoryHistory.length === 0) return null;
  const previous = { ...memoryHistory.shift()! };
  delete (previous as any).savedAt;
  await writeConfig(previous);
  return previous;
}

export async function getConfigHistory(): Promise<Array<GatewayConfig & { savedAt: string }>> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.lrange<string>('ai-gateway:config-history', 0, 9);
      if (raw.length > 0) {
        return raw.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean) as Array<GatewayConfig & { savedAt: string }>;
      }
    } catch {
      // fall through
    }
  }
  return memoryHistory;
}

// ===== 重置 =====

export async function resetGatewayConfig(): Promise<GatewayConfig> {
  const current = await getGatewayConfig();
  await saveHistory(current);
  await writeConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

// ===== 测试连接 =====

export async function testGatewayConnection(config: Partial<GatewayConfig>): Promise<{
  ok: boolean;
  latencyMs: number;
  model?: string;
  attemptedUrl?: string;
  warning?: string;
  error?: string;
}> {
  const start = Date.now();
  const baseUrl = cleanBaseUrl(config.baseUrl || '');
  const apiKey = config.apiKey || '';
  const apiFormat = config.apiFormat || 'openai-compat';
  const endpoint = buildGatewayEndpoint(baseUrl, apiFormat);

  if (!baseUrl || !apiKey) {
    return { ok: false, latencyMs: 0, attemptedUrl: endpoint.attemptedUrl, warning: endpoint.warning, error: '缺少 API 地址或密钥' };
  }

  try {
    if (apiFormat === 'anthropic') {
      const res = await fetch(endpoint.attemptedUrl, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model || 'claude-sonnet-4-6',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      const latencyMs = Date.now() - start;
      if (res.ok) return { ok: true, latencyMs, model: config.model, attemptedUrl: endpoint.attemptedUrl, warning: endpoint.warning };
      const err = await res.text().catch(() => '');
      return { ok: false, latencyMs, attemptedUrl: endpoint.attemptedUrl, warning: endpoint.warning, error: formatGatewayError(res.status, err, endpoint) };
    } else {
      const res = await fetch(endpoint.attemptedUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'deepseek-chat',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      const latencyMs = Date.now() - start;
      if (res.ok) return { ok: true, latencyMs, model: config.model, attemptedUrl: endpoint.attemptedUrl, warning: endpoint.warning };
      const err = await res.text().catch(() => '');
      return { ok: false, latencyMs, attemptedUrl: endpoint.attemptedUrl, warning: endpoint.warning, error: formatGatewayError(res.status, err, endpoint) };
    }
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, attemptedUrl: endpoint.attemptedUrl, warning: endpoint.warning, error: String(e).slice(0, 200) };
  }
}

function formatGatewayError(status: number, rawError: string, endpoint: GatewayEndpointPreview): string {
  const raw = rawError.slice(0, 200);
  if (status === 404) {
    if (/\/v1\/v1/i.test(raw) || /\/v1\/v1/i.test(endpoint.attemptedUrl)) {
      return `HTTP 404：检测到 API 地址可能重复包含 /v1。当前请求：${endpoint.attemptedUrl}`;
    }
    return `HTTP 404：服务商没有找到接口。当前请求：${endpoint.attemptedUrl}。请确认 API 地址和模型服务是否匹配。${raw ? ` 原始响应：${raw}` : ''}`;
  }
  return `HTTP ${status}: ${raw}`;
}

// ===== Gateway 调用统计 =====

export async function getGatewayStats(): Promise<{
  totalCalls: number;
  aiCalls: number;
  fallbackCalls: number;
  blockedCalls: number;
  avgLatencyMs: number;
  fallbackRate: number;
  byModel: Record<string, number>;
  byFallbackReason: Record<string, number>;
  hourlyDistribution: Array<{ hour: number; count: number }>;
}> {
  const empty = {
    totalCalls: 0, aiCalls: 0, fallbackCalls: 0, blockedCalls: 0,
    avgLatencyMs: 0, fallbackRate: 0, byModel: {}, byFallbackReason: {},
    hourlyDistribution: [],
  };

  const redis = getRedis();
  if (!redis) return empty;

  try {
    const raw = await redis.lrange<string>('ai-gateway:logs', 0, 499);
    const logs = raw.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean) as Array<Record<string, unknown>>;

    const totalCalls = logs.length;
    const aiCalls = logs.filter(l => l.mode === 'ai').length;
    const fallbackCalls = logs.filter(l => l.mode === 'fallback').length;
    const blockedCalls = logs.filter(l => l.mode === 'blocked').length;
    const totalLatency = logs.reduce((s, l) => s + (Number(l.latencyMs) || 0), 0);

    const byModel: Record<string, number> = {};
    const byFallbackReason: Record<string, number> = {};
    const hourCounts = new Map<number, number>();

    for (const log of logs) {
      const route = String(log.route || 'unknown');
      byModel[route] = (byModel[route] || 0) + 1;
      const reason = String(log.fallbackReason || '');
      if (reason) byFallbackReason[reason] = (byFallbackReason[reason] || 0) + 1;
      const ts = String(log.timestamp || '');
      if (ts) {
        const hour = new Date(ts).getHours();
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      }
    }

    return {
      totalCalls, aiCalls, fallbackCalls, blockedCalls,
      avgLatencyMs: totalCalls > 0 ? Math.round(totalLatency / totalCalls) : 0,
      fallbackRate: totalCalls > 0 ? (fallbackCalls + blockedCalls) / totalCalls : 0,
      byModel, byFallbackReason,
      hourlyDistribution: [...hourCounts.entries()].sort((a, b) => a[0] - b[0]).map(([hour, count]) => ({ hour, count })),
    };
  } catch {
    return empty;
  }
}
