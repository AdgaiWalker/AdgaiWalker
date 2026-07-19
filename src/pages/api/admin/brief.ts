import type { APIRoute } from 'astro';

import { isAdminAsync } from '@/lib/admin-auth';
import { captureException } from '@/lib/sentry';
import { createSessionStore } from '@/stores/session.store';
import { getTopicCandidateById } from '@/stores/topic.store';
import { generateBrief } from '@/services/brief.service';

const sessionStore = createSessionStore();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);

  let body: { topicId?: unknown };
  try {
    body = await request.json();
  } catch (error) {
    captureException(error, { action: 'brief.generate' });
    return json({ error: '请求格式不正确。' }, 400);
  }

  if (typeof body.topicId !== 'string' || !body.topicId) {
    return json({ error: '缺少 topicId。' }, 400);
  }

  const topic = await getTopicCandidateById(body.topicId);
  if (!topic) return json({ error: '选题不存在。' }, 404);

  return json({ brief: generateBrief(topic) });
};
