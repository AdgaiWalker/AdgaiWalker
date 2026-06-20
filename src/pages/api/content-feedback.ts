/**
 * POST /api/content-feedback —— 公开内容反馈写入（P1-A04）
 *
 * 公开接口（访客可提交）。只接收客户端必要字段：
 *   { contentId, signal, note?, consentForAnalysis }
 *
 * - sourceTopicId 由服务端派生，忽略客户端传入。
 * - 基础滥用保护：请求体大小 + note 限长。
 * - 不用 IP 明文作长期用户识别。
 * - 状态码：201 成功 / 400 格式错误 / 404 内容不存在 / 429 频率限制 / 503 存储不可用。
 * - Cache-Control: no-store。
 */
import type { APIRoute } from 'astro';

import { createContentFeedbackService } from '@/services/content-feedback.service';
import type { ContentFeedbackSignal } from '@/stores/ports';

export const prerender = false;

const VALID_SIGNALS: ContentFeedbackSignal[] = ['useful', 'needs-more', 'outdated'];
const MAX_NOTE_LENGTH = 240;
const MAX_BODY_BYTES = 4 * 1024; // 4KB，防止超大请求体

const STATUS_BY_CODE: Record<string, number> = {
  ok: 201,
  'content-not-found': 404,
  'content-not-public': 404,
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
  // 基础滥用保护：请求体大小
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: '请求体过大。' }, 413);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误。' }, 400);
  }

  if (typeof body.contentId !== 'string' || !body.contentId.trim()) {
    return json({ error: 'contentId 不能为空。' }, 400);
  }
  if (typeof body.signal !== 'string' || !VALID_SIGNALS.includes(body.signal as ContentFeedbackSignal)) {
    return json({ error: 'signal 不合法，可选：useful / needs-more / outdated。' }, 400);
  }
  if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > MAX_NOTE_LENGTH)) {
    return json({ error: `note 不能超过 ${MAX_NOTE_LENGTH} 字。` }, 400);
  }

  const service = createContentFeedbackService();
  const result = await service.submit({
    contentId: body.contentId.trim(),
    signal: body.signal as ContentFeedbackSignal,
    note: typeof body.note === 'string' ? body.note : undefined,
    consentForAnalysis: body.consentForAnalysis === true,
  });

  if (!result.ok) {
    return json({ error: result.message ?? '提交失败。', code: result.code }, STATUS_BY_CODE[result.code] ?? 400);
  }
  return json({ ok: true, feedbackId: result.feedbackId, sourceTopicId: result.sourceTopicId }, 201);
};
