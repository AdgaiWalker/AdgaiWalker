import type { APIRoute } from 'astro';

import { getRedis } from '@/conversation/store';

export const prerender = false;

const MAX_QUERY = 50;
const MAX_LIST = 1000;

/**
 * POST /api/search-events — 记录用户搜索无结果的查询（内容缺口信号）。
 *
 * 无鉴权（公开搜索）；仅记查询文本 + 时间戳，不记 PII；Redis 失败静默
 * （fire-and-forget，不影响用户搜索体验）。
 */
export const POST: APIRoute = async ({ request }) => {
  let query = '';
  try {
    const body = await request.json() as { query?: unknown };
    if (typeof body?.query === 'string') query = body.query;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const q = query.trim().slice(0, MAX_QUERY);
  if (!q) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const redis = getRedis();
  if (redis) {
    try {
      await redis.lpush('search:misses', JSON.stringify({ q, t: Date.now() }));
      await redis.ltrim('search:misses', 0, MAX_LIST - 1);
    } catch {
      // Redis 失败静默：记录是 fire-and-forget，不影响用户
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
