import type { APIRoute } from 'astro';
import { isAdmin } from '@/lib/admin-auth';
import { writeAmbientState, readAmbientState } from '@/lib/ambient/store';
import { buildFreshState, FALLBACK_LOCATION } from '@/lib/ambient/signals';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// GET：读取当前 ambient:state（管理员）
export const GET: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) return json({ error: '未授权' }, 401);
  return json({ state: await readAmbientState() });
};

// POST：设置站主位置（实时定位或手动坐标）→ 拉天气 + 算日出 + 定节气 → 存
export const POST: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) return json({ error: '未授权' }, 401);
  let body: { lat?: number; lng?: number; cityLabel?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式不正确' }, 400);
  }
  if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    return json({ error: '缺少 lat/lng' }, 400);
  }
  const cityLabel = body.cityLabel?.trim() || FALLBACK_LOCATION.cityLabel;
  const state = await buildFreshState(body.lat, body.lng, cityLabel, FALLBACK_LOCATION.tz);
  try {
    await writeAmbientState(state);
  } catch {
    return json({ error: 'Redis 不可用，无法保存（生产需配置 Upstash Redis）' }, 503);
  }
  return json({ ok: true, state });
};
