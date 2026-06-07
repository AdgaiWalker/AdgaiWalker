/**
 * /api/like — Upstash Redis 点赞接口
 * GET  ?path=/posts/xxx  → { count: number }
 * POST { path: string }  → { count: number }  (点赞+1)
 *
 * 安全措施：
 * - 路径白名单校验（只接受 /posts/、/ideas/、/projects/、/tools/ 前缀）
 * - 同一 IP 每路径每 60s 只能点赞一次（Redis TTL）
 * - 点赞上限保护：单页不超过 999999
 * - Redis 不可用时返回 fallback，不报错
 */
import type { APIRoute } from 'astro';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

/** 每路径每 IP 的冷却秒数 */
const COOLDOWN_SECONDS = 60;
/** 单页点赞上限 */
const MAX_COUNT = 999_999;
/** Redis 不可用时的 fallback */
const FALLBACK = 17_861;

/** 合法路径前缀 */
const ALLOWED_PREFIXES = ['/posts/', '/ideas/', '/projects/', '/tools/', '/about'];

function isValidPath(p: unknown): p is string {
  return typeof p === 'string' && ALLOWED_PREFIXES.some((pre) => p.startsWith(pre));
}

/** 获取客户端 IP（Vercel 注入） */
function getClientIP(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export const GET: APIRoute = async ({ url }) => {
  const path = url.searchParams.get('path');

  if (!isValidPath(path)) {
    return new Response(JSON.stringify({ error: 'invalid path' }), { status: 400 });
  }

  try {
    const count = (await redis.get<number>(`like:${path}`)) ?? FALLBACK;
    return new Response(JSON.stringify({ count }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=10' },
    });
  } catch {
    return new Response(JSON.stringify({ count: FALLBACK }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  let body: { path?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 });
  }

  const path = body.path;
  if (!isValidPath(path)) {
    return new Response(JSON.stringify({ error: 'invalid path' }), { status: 400 });
  }

  const ip = getClientIP(request);
  const cooldownKey = `cooldown:${path}:${ip}`;

  try {
    // 检查冷却
    const cooled = await redis.get(cooldownKey);
    if (cooled) {
      const count = (await redis.get<number>(`like:${path}`)) ?? FALLBACK;
      return new Response(JSON.stringify({ count, cooldown: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 读取当前计数，fallback 起步
    const current = (await redis.get<number>(`like:${path}`)) ?? FALLBACK;
    const next = Math.min(current + 1, MAX_COUNT);
    await redis.set(`like:${path}`, next);

    // 设置冷却标记（60s TTL）
    await redis.expire(cooldownKey, COOLDOWN_SECONDS);
    await redis.set(cooldownKey, 1);
    await redis.expire(cooldownKey, COOLDOWN_SECONDS);

    return new Response(JSON.stringify({ count: next }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ count: FALLBACK }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
