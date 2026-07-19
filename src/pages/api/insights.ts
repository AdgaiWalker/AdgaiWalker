import type { APIRoute } from 'astro';
import { isAdmin } from '@/lib/admin-auth';
import { getNeedCaseStats, getTopicCandidates, updateTopicCandidateStatus } from '@/conversation/store';
import type { TopicCandidate } from '@/stores/ports';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function isAuthorized(request: Request): boolean {
  // 管理员 cookie 优先
  if (isAdmin(request)) return true;

  // 定时任务 header
  const secrets = [
    import.meta.env.MATCH_PROCESS_SECRET,
    import.meta.env.CRON_SECRET,
  ].filter((s): s is string => Boolean(s));
  if (secrets.length === 0) return !import.meta.env.PROD;
  const header = request.headers.get('x-match-process-secret');
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return secrets.includes(header ?? '') || secrets.includes(bearer ?? '');
}

// GET: 查询洞察数据
export const GET: APIRoute = async ({ request, url }) => {
  if (!isAuthorized(request)) {
    return jsonResponse({ error: '未授权。' }, 401);
  }

  const type = url.searchParams.get('type');

  if (type === 'topics') {
    const status = url.searchParams.get('status') as TopicCandidate['status'] | null;
    const limit = Number(url.searchParams.get('limit')) || 50;
    const topics = await getTopicCandidates({ status: status ?? undefined, limit });
    return jsonResponse({ topics, count: topics.length });
  }

  // 默认返回统计数据
  const days = Number(url.searchParams.get('days')) || 30;
  const stats = await getNeedCaseStats({ days });
  return jsonResponse(stats);
};

// POST: 更新 TopicCandidate 状态
export const POST: APIRoute = async ({ request }) => {
  if (!isAuthorized(request)) {
    return jsonResponse({ error: '未授权。' }, 401);
  }

  let body: { topicId?: string; status?: string; producedContentSlug?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求格式不正确。' }, 400);
  }

  if (!body.topicId || typeof body.topicId !== 'string') {
    return jsonResponse({ error: '缺少 topicId。' }, 400);
  }

  const validStatuses: TopicCandidate['status'][] = ['accepted', 'deferred', 'ignored', 'produced'];
  if (!body.status || !validStatuses.includes(body.status as TopicCandidate['status'])) {
    return jsonResponse({ error: `status 只能是 ${validStatuses.join('/')}` }, 400);
  }
  if (body.producedContentSlug !== undefined && typeof body.producedContentSlug !== 'string') {
    return jsonResponse({ error: 'producedContentSlug 必须是字符串。' }, 400);
  }

  const updated = await updateTopicCandidateStatus(
    body.topicId,
    body.status as TopicCandidate['status'],
    typeof body.producedContentSlug === 'string' && body.producedContentSlug.trim()
      ? { producedContentSlug: body.producedContentSlug.trim() }
      : undefined,
  );

  return jsonResponse({ ok: Boolean(updated), topicId: body.topicId, status: body.status, topic: updated });
};
