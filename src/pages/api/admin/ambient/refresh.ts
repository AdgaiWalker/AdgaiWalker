import type { APIRoute } from 'astro';
import { isAdmin } from '@/lib/admin-auth';
import { writeAmbientState, readAmbientState } from '@/lib/ambient/store';
import { buildFreshState } from '@/lib/ambient/signals';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// POST：保持位置，重拉天气 + 重算（手动"立刻刷新"）
export const POST: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) return json({ error: '未授权' }, 401);
  const current = await readAmbientState();
  if (!current) return json({ error: '尚未设置位置，请先定位' }, 400);
  const state = await buildFreshState(current.lat, current.lng, current.cityLabel, current.tz);
  try {
    await writeAmbientState(state);
  } catch {
    return json({ error: 'Redis 不可用' }, 503);
  }
  return json({ ok: true, state });
};
