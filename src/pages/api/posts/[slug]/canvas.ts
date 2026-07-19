import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { saveCanvasDraft } from '@/stores/canvas-draft.store';
import { consumeRateLimit } from '@/lib/rate-limiter';
import { readBodyWithLimit } from '@/lib/body-reader';

export const prerender = false;

const MAX_BODY_BYTES = 200 * 1024; // 200KB limit for markdown text
const RATE_LIMIT_CONFIG = { windowSeconds: 60, max: 15 }; // 1分钟最多修改15次

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * POST /api/posts/[slug]/canvas
 * 保存共创画布的草稿内容
 */
export const POST: APIRoute = async ({ params, request }) => {
  const { slug } = params;
  if (!slug) {
    return json({ error: '缺失 slug' }, 400);
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: '请求体过大' }, 413);
  }

  // 频率限流
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  const rateLimit = await consumeRateLimit('canvas-save', clientIp, RATE_LIMIT_CONFIG);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({ error: '保存过于频繁，请稍后再试。' }),
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

  // 限制读取大小
  const bodyRead = await readBodyWithLimit(request.body, MAX_BODY_BYTES);
  if (bodyRead.tooLarge) {
    return json({ error: '请求体过大' }, 413);
  }

  let body: Record<string, unknown>;
  try {
    body = bodyRead.text ? JSON.parse(bodyRead.text) : {};
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const content = typeof body.content === 'string' ? body.content : null;

  if (content === null) {
    return json({ error: 'content 字段不能为空。' }, 400);
  }

  try {
    const entry = await getEntry('log', slug);
    if (!entry) {
      return json({ error: '点子不存在' }, 404);
    }

    await saveCanvasDraft(slug, content);

    return json({ ok: true });
  } catch (error) {
    console.error('Failed to save canvas draft:', error);
    return json({ error: 'Internal Server Error' }, 500);
  }
};
