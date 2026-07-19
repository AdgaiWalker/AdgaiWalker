import type { APIRoute } from 'astro';
import { isAdminAsync } from '@/lib/admin-auth';
import { requireHighRiskAudit } from '@/lib/admin-audit';
import { resolveAdminActor } from '@/lib/admin-actor';
import { captureException } from '@/lib/sentry';
import { createSessionStore } from '@/stores/session.store';
import {
  PROVIDER_PRESETS,
  type GatewayConfig,
  getGatewayConfig,
  updateGatewayConfig,
  getGatewayStats,
  undoGatewayConfig,
  resetGatewayConfig,
  getConfigHistory,
  testGatewayConnection,
} from '@/agent/gateway-config';
import { readGatewayLogs } from '@/agent/gateway';

const sessionStore = createSessionStore();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** GET — 读取配置 + 统计 + 日志 + 预设 */
export const GET: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);

  const [config, stats, logs, history] = await Promise.all([
    getGatewayConfig(),
    getGatewayStats(),
    readGatewayLogs(50),
    getConfigHistory(),
  ]);

  return json({
    config,
    stats,
    logs,
    history,
    providers: PROVIDER_PRESETS,
  });
};

/** PUT — 更新配置 */
export const PUT: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch (error) {
    captureException(error, { action: 'gateway.config.update' });
    return json({ error: '请求格式错误。' }, 400);
  }

  const updates: Record<string, unknown> = {};

  // 服务商
  if (typeof body.provider === 'string') {
    const preset = PROVIDER_PRESETS.find(p => p.id === body.provider);
    if (!preset) {
      return json({ error: `不支持的服务商。可选：${PROVIDER_PRESETS.map(p => p.id).join('、')}` }, 400);
    }
    updates.provider = body.provider;
    updates.apiFormat = preset.apiFormat;

    // 切换服务商时自动填入 baseUrl
    if (preset.baseUrl) {
      updates.baseUrl = preset.baseUrl;
    }
  }

  // API 地址
  if (typeof body.baseUrl === 'string') {
    updates.baseUrl = body.baseUrl.trim().replace(/\/+$/, '');
  }

  // API Key（不校验格式，原样存储）
  if (typeof body.apiKey === 'string') {
    updates.apiKey = body.apiKey;
  }

  // 模型名（不限制，允许自由输入）
  if (typeof body.model === 'string' && body.model.trim()) {
    updates.model = body.model.trim();
  }

  // 参数
  if (typeof body.maxTokens === 'number' && body.maxTokens >= 100 && body.maxTokens <= 8000) {
    updates.maxTokens = Math.floor(body.maxTokens);
  }

  if (typeof body.temperature === 'number' && body.temperature >= 0 && body.temperature <= 2) {
    updates.temperature = Math.round(body.temperature * 100) / 100;
  }

  if (typeof body.timeoutMs === 'number' && body.timeoutMs >= 3000 && body.timeoutMs <= 120000) {
    updates.timeoutMs = Math.floor(body.timeoutMs);
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: '没有有效的配置更新。' }, 400);
  }

  const actor = await resolveAdminActor(request);
  const audit = await requireHighRiskAudit({
    actor,
    action: 'gateway.config.update',
    targetType: 'ai-gateway',
    reason: '修改 AI Gateway 配置会影响所有 AI 调用。',
    detail: { fields: Object.keys(updates) },
  });
  if (!audit.ok) return json({ error: audit.reason, code: audit.code }, audit.status);

  const updated = await updateGatewayConfig(updates);
  // 返回时隐藏 apiKey 中间部分
  return json({ ok: true, config: maskApiKey(updated) });
};

/** POST — 测试连接 */
export const POST: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch (error) {
    captureException(error, { action: 'gateway.config.test' });
    return json({ error: '请求格式错误。' }, 400);
  }

  // 如果没传完整配置，用当前配置 + 传入的覆盖
  const current = await getGatewayConfig();
  const testConfig: Partial<import('@/agent/gateway-config').GatewayConfig> = {
    baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : current.baseUrl,
    apiKey: typeof body.apiKey === 'string' ? body.apiKey : current.apiKey,
    model: typeof body.model === 'string' ? body.model : current.model,
    apiFormat: (typeof body.apiFormat === 'string' ? body.apiFormat : current.apiFormat) as import('@/agent/gateway-config').GatewayConfig['apiFormat'],
  };

  if (typeof body.provider === 'string') {
    const preset = PROVIDER_PRESETS.find(p => p.id === body.provider);
    if (preset) testConfig.apiFormat = preset.apiFormat;
  }

  const result = await testGatewayConnection(testConfig);
  return json(result);
};

/** PATCH — 撤销 */
export const PATCH: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);

  const actor = await resolveAdminActor(request);
  const audit = await requireHighRiskAudit({
    actor,
    action: 'gateway.config.undo',
    targetType: 'ai-gateway',
    reason: '撤销 AI Gateway 配置会影响后续 AI 调用。',
  });
  if (!audit.ok) return json({ error: audit.reason, code: audit.code }, audit.status);

  const restored = await undoGatewayConfig();
  if (!restored) {
    return json({ error: '没有可撤销的配置。' }, 404);
  }

  return json({ ok: true, config: maskApiKey(restored) });
};

/** DELETE — 重置 */
export const DELETE: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);

  const actor = await resolveAdminActor(request);
  const audit = await requireHighRiskAudit({
    actor,
    action: 'gateway.config.reset',
    targetType: 'ai-gateway',
    reason: '重置 AI Gateway 配置会影响所有 AI 调用。',
  });
  if (!audit.ok) return json({ error: audit.reason, code: audit.code }, audit.status);

  const config = await resetGatewayConfig();
  return json({ ok: true, config: maskApiKey(config) });
};

/** 隐藏 apiKey 中间部分 */
function maskApiKey(config: GatewayConfig): Record<string, unknown> {
  const key = String(config.apiKey || '');
  const masked = key.length <= 8 ? (key ? '****' : '') : key.slice(0, 4) + '****' + key.slice(-4);
  return { ...config, apiKey: masked };
}
