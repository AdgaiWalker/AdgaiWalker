/**
 * POST /api/content-telemetry —— 公开阅读深度遥测写入（P3-A）
 *
 * 公开接口（访客阅读时被动采集）。只接收客户端必要字段：
 *   { contentId, eventType, progress, readerToken, consentForAnalysis }
 *
 * - sourceTopicId 由服务端派生，忽略客户端传入。
 * - 不用 IP 明文作长期识别（限流用 IP 哈希仅滚动窗口内瞬态）。
 * - 基础滥用保护：请求体大小 + 频率限流。
 * - 状态码：201 成功 / 400 格式错误 / 404 内容不存在 / 429 频率限制 / 503 存储不可用。
 * - Cache-Control: no-store。
 */
import type { APIRoute } from 'astro';

import { createContentTelemetryService } from '@/services/content-telemetry.service';
import { consumeRateLimit } from '@/lib/rate-limiter';
import { readBodyWithLimit } from '@/lib/body-reader';
import type { ContentTelemetryEventType } from '@/stores/ports';

export const prerender = false;

const VALID_EVENT_TYPES: ContentTelemetryEventType[] = ['content_progress', 'content_complete'];
const MAX_BODY_BYTES = 2 * 1024; // 2KB，遥测请求体很小
// 阅读进度 beacon 比反馈高频（客户端按 25% 步进节流），限流放宽到 60s/20 次
const RATE_LIMIT_CONFIG = { windowSeconds: 60, max: 20 };

const STATUS_BY_CODE: Record<string, number> = {
  ok: 201,
  'content-not-found': 404,
  'invalid-input': 400,
  'storage-unavailable': 503,
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: '请求体过大。' }, 413);
  }

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  const rateLimit = await consumeRateLimit('content-telemetry', clientIp, RATE_LIMIT_CONFIG);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({ error: '提交过于频繁，请稍后再试。', code: 'rate-limited' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Retry-After': String(rateLimit.retryAfter),
        },
      },
    );
  }

  const bodyRead = await readBodyWithLimit(request.body, MAX_BODY_BYTES);
  if (bodyRead.tooLarge) {
    return json({ error: '请求体过大。' }, 413);
  }

  let body: Record<string, unknown>;
  try {
    body = bodyRead.text ? JSON.parse(bodyRead.text) : {};
  } catch {
    return json({ error: '请求格式错误。' }, 400);
  }

  if (typeof body.contentId !== 'string' || !body.contentId.trim()) {
    return json({ error: 'contentId 不能为空。' }, 400);
  }
  if (typeof body.eventType !== 'string' || !VALID_EVENT_TYPES.includes(body.eventType as ContentTelemetryEventType)) {
    return json({ error: 'eventType 不合法，可选：content_progress / content_complete。' }, 400);
  }
  if (typeof body.readerToken !== 'string' || !body.readerToken.trim()) {
    return json({ error: 'readerToken 不能为空。' }, 400);
  }
  const progress = Number(body.progress);
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    return json({ error: 'progress 必须是 0–1 之间的数。' }, 400);
  }

  const service = createContentTelemetryService();
  const result = await service.submit({
    contentId: body.contentId.trim(),
    eventType: body.eventType as ContentTelemetryEventType,
    progress,
    readerToken: body.readerToken.trim(),
    consentForAnalysis: body.consentForAnalysis === true,
  });

  if (!result.ok) {
    return json({ error: result.message ?? '提交失败。', code: result.code }, STATUS_BY_CODE[result.code] ?? 400);
  }
  return json({ ok: true, eventId: result.eventId, sourceTopicId: result.sourceTopicId }, 201);
};
