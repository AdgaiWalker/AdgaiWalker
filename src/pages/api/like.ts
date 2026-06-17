/**
 * /api/like — 文章点赞接口（HTTP 薄层，委托 like.store）
 * GET  ?path=/posts/xxx  → { count: number }
 * POST { path: string }  → { count: number, cooldown?: true }
 *
 * 计数与降级逻辑在 src/stores/like.store.ts：
 * - 有 Upstash/KV 配置 → Redis 真持久（incr 原子自增，修旧并发丢赞）
 * - 否则 / Redis 运行时异常 → 内存降级（dev 也能真点真涨，重启丢失）
 * - 0 起步真实计数，不再有写死的假基数 17861
 *
 * 安全：路径白名单 + 每路径每 IP 60s 冷却 + 单页 999999 上限（均在 store 内）。
 */
import type { APIRoute } from 'astro';

import { createLikeStore } from '@/stores/like.store';

const store = createLikeStore();

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

function json(body: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extra ?? {}) },
  });
}

export const GET: APIRoute = async ({ url }) => {
  const path = url.searchParams.get('path');
  if (!isValidPath(path)) return json({ error: 'invalid path' }, 400);
  const count = await store.getCount(path);
  return json({ count }, 200, { 'Cache-Control': 's-maxage=10' });
};

export const POST: APIRoute = async ({ request }) => {
  let body: { path?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const path = body.path;
  if (!isValidPath(path)) return json({ error: 'invalid path' }, 400);

  const { count, cooled } = await store.increment(path, getClientIP(request));
  return json(cooled ? { count, cooldown: true } : { count });
};
