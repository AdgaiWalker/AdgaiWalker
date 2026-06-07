import type { APIRoute } from 'astro';
import { isAdmin } from '@/lib/admin-auth';
import { getRedis } from '@/conversation/store';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** GET /api/admin/conversations — 管理员查看所有对话 */
export const GET: APIRoute = async ({ request, url }) => {
  if (!isAdmin(request)) {
    return jsonResponse({ error: '未授权。' }, 401);
  }

  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 50);
  const redis = getRedis();

  if (!redis) {
    return jsonResponse({ conversations: [], total: 0 });
  }

  // 获取所有会话 ID
  const sessionIds = await redis.smembers('match:sessions');
  const total = sessionIds.length;

  // 逐个获取会话和消息（最多 limit 个，按 lastActiveAt 降序）
  const sessions = await Promise.all(
    sessionIds.slice(0, limit).map(async id => redis.get<Record<string, unknown>>(`match:session:${id}`))
  );

  // 按最后活跃时间降序
  const sorted = sessions
    .filter(Boolean)
    .sort((a, b) => {
      const aTime = String(a?.lastActiveAt ?? '');
      const bTime = String(b?.lastActiveAt ?? '');
      return bTime.localeCompare(aTime);
    })
    .slice(0, limit);

  // 获取每个会话的消息
  const conversations = await Promise.all(
    sorted.map(async session => {
      const sessionId = String(session?.sessionId);
      const messages = await redis.lrange<Record<string, unknown>>(`match:messages:${sessionId}`, 0, -1);
      return {
        sessionId,
        startedAt: session?.startedAt,
        lastActiveAt: session?.lastActiveAt,
        endedAt: session?.endedAt ?? null,
        messageCount: Number(session?.messageCount ?? messages.length),
        audienceGroup: session?.audienceGroup ?? null,
        aiStage: session?.aiStage ?? null,
        isMinorContext: Boolean(session?.isMinorContext),
        messages: messages.map(m => ({
          role: m?.role,
          content: m?.content,
          timestamp: m?.timestamp,
        })),
      };
    })
  );

  return jsonResponse({ conversations, total });
};
