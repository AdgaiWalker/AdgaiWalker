import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { getRecentNeedCases, getTopicCandidates } from '@/conversation/store';
import { getPublishedContentItems } from '@/knowledge/content';
import { calculateContentHitRates } from '@/services/hit-rate.service';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) return json({ error: '未授权。' }, 401);

  const [contents, topics, needCases] = await Promise.all([
    getPublishedContentItems(),
    getTopicCandidates({ limit: 500 }),
    getRecentNeedCases(2000),
  ]);

  const hitRates = calculateContentHitRates({ contents, topics, needCases });
  return json({ hitRates, count: hitRates.length });
};
