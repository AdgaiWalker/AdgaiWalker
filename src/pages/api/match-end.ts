import type { APIRoute } from 'astro';

import { endMatchSession } from '@/conversation/store';

const MAX_BODY_BYTES = 512;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function getBodyByteLength(request: Request): number {
  const raw = request.headers.get('content-length');
  return raw ? Number(raw) : 0;
}

export const POST: APIRoute = async ({ request }) => {
  if (getBodyByteLength(request) > MAX_BODY_BYTES) {
    return jsonResponse({ error: '请求太长。' }, 413);
  }

  let sessionId: string | undefined;
  try {
    const rawText = await request.text();
    if (new TextEncoder().encode(rawText).length > MAX_BODY_BYTES) {
      return jsonResponse({ error: '请求太长。' }, 413);
    }
    const body = JSON.parse(rawText) as { sessionId?: unknown };
    if (typeof body.sessionId === 'string') sessionId = body.sessionId;
  } catch {
    return jsonResponse({ error: '请求格式不正确。' }, 400);
  }

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return jsonResponse({ error: '缺少 sessionId。' }, 400);
  }

  const session = await endMatchSession(sessionId);
  return jsonResponse({ ok: Boolean(session), endedAt: session?.endedAt });
};
