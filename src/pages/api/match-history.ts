import type { APIRoute } from 'astro';
import { isAdmin } from '@/lib/admin-auth';
import { getMultipleConversations, getMatchSession } from '@/conversation/store';

const MAX_SESSION_IDS = 10;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!isAdmin(request)) {
    return jsonResponse({ conversations: [] });
  }

  const raw = url.searchParams.get('sessionIds') ?? '';
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, MAX_SESSION_IDS);

  // 验证所有 sessionId 格式
  const validIds = ids.filter(id => SESSION_ID_PATTERN.test(id));
  if (validIds.length === 0) {
    return jsonResponse({ conversations: [] });
  }

  const conversations = await getMultipleConversations(validIds);

  // 附加会话元数据
  const enriched = await Promise.all(
    conversations.map(async conv => {
      const session = await getMatchSession(conv.sessionId);
      return {
        sessionId: conv.sessionId,
        messages: conv.messages,
        audienceGroup: session?.audienceGroup,
        aiStage: session?.aiStage,
        startedAt: session?.startedAt,
      };
    })
  );

  return jsonResponse({ conversations: enriched });
};
