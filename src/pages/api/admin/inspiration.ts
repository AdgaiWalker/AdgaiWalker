/**
 * POST /api/admin/inspiration — 站主灵感入口（B4）
 *
 * 把站主主动提出的选题灵感存入选题池（TopicCandidate, clusterKey=inspiration），
 * 与用户需求簇并置判断（PRD §3.7 选题池双源）。
 */

import { randomUUID } from 'node:crypto';

import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { saveTopicCandidates } from '@/conversation/store';
import type { TopicCandidate } from '@/stores/ports';

const MAX_TEXT_LENGTH = 200;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) return json({ error: '未授权' }, 401);

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式不正确' }, 400);
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return json({ error: '灵感不能为空' }, 400);
  if (text.length > MAX_TEXT_LENGTH) {
    return json({ error: `灵感不超过 ${MAX_TEXT_LENGTH} 字` }, 400);
  }

  const now = new Date().toISOString();
  const candidate: TopicCandidate = {
    topicId: randomUUID(),
    clusterKey: 'inspiration',
    createdAt: now,
    title: text,
    density: 0,
    roleDistribution: [{ role: '站主灵感', count: 1 }],
    representativeNeed: text,
    relatedContentIds: [],
    priority: 'medium',
    status: 'observed',
    source: 'inspiration',
  };

  await saveTopicCandidates([candidate]);
  return json({ ok: true, topicId: candidate.topicId });
};
