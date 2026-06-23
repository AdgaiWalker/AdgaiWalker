import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import {
  saveCollaboratorApplication,
  findCollaboratorsByContent,
  getCollaboratorCountByContent,
  type CollaboratorApplication
} from '@/stores/collaborator.store';
import { consumeRateLimit } from '@/lib/rate-limiter';
import { readBodyWithLimit } from '@/lib/body-reader';

export const prerender = false;

const MAX_BODY_BYTES = 8 * 1024; // 8KB
const RATE_LIMIT_CONFIG = { windowSeconds: 60, max: 3 }; // 1分钟最多3次

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * GET /api/posts/[slug]/collaborate
 * 返回当前点子的同频者数量及最新同频列表 (脱敏后的 role 和 suggestion)
 */
export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;
  if (!slug) {
    return json({ error: '缺失 slug' }, 400);
  }

  try {
    const entry = await getEntry('log', slug);
    if (!entry) {
      return json({ error: '点子不存在' }, 404);
    }

    const count = await getCollaboratorCountByContent(slug);
    const list = await findCollaboratorsByContent(slug);

    // 脱敏后返回，去除 IP 等信息
    const collaborators = list.map(item => ({
      role: item.role,
      suggestion: item.suggestion,
      createdAt: item.createdAt
    }));

    return json({ count, collaborators });
  } catch (error) {
    console.error('Failed to get collaborators:', error);
    return json({ error: 'Internal Server Error' }, 500);
  }
};

/**
 * POST /api/posts/[slug]/collaborate
 * 提交同频者靠近申请
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
  const rateLimit = await consumeRateLimit('collaborate', clientIp, RATE_LIMIT_CONFIG);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({ error: '提交过于频繁，请稍后再试。' }),
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

  // 限制读取请求大小
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

  const role = typeof body.role === 'string' ? body.role.trim() : '';
  const suggestion = typeof body.suggestion === 'string' ? body.suggestion.trim() : '';

  if (!role) {
    return json({ error: '技能身份不能为空。' }, 400);
  }
  if (role.length > 80) {
    return json({ error: '技能身份长度不能超过 80 字。' }, 400);
  }
  if (!suggestion) {
    return json({ error: '行动建议不能为空。' }, 400);
  }
  if (suggestion.length > 400) {
    return json({ error: '行动建议长度不能超过 400 字。' }, 400);
  }

  try {
    const entry = await getEntry('log', slug);
    if (!entry) {
      return json({ error: '点子不存在' }, 404);
    }

    const app: CollaboratorApplication = {
      id: `collab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      contentId: slug,
      role,
      suggestion,
      createdAt: new Date().toISOString(),
      ip: clientIp,
    };

    await saveCollaboratorApplication(app);

    return json({ ok: true });
  } catch (error) {
    console.error('Failed to submit collaborator application:', error);
    return json({ error: 'Internal Server Error' }, 500);
  }
};
