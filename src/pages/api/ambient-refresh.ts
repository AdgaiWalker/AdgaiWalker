import type { APIRoute } from 'astro';
import { writeAmbientState, readAmbientState } from '@/lib/ambient/store';
import { buildFreshState } from '@/lib/ambient/signals';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// CRON_SECRET 鉴权（对齐 insights/match-process 的密钥校验）
function cronAuthorized(request: Request): boolean {
  const secret = import.meta.env.CRON_SECRET;
  if (!secret) return !import.meta.env.PROD; // 未配置时仅非生产放行
  const header = request.headers.get('x-match-process-secret');
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return secret === (header ?? '') || secret === (bearer ?? '');
}

// GET：每小时 cron 重拉天气、换日重算日出（保持站主位置）。无位置则跳过。
export const GET: APIRoute = async ({ request }) => {
  if (!cronAuthorized(request)) return json({ error: '未授权' }, 401);
  const current = await readAmbientState();
  if (!current) return json({ ok: false, reason: '尚未设置位置，跳过（访客侧用成都兜底）' });
  const state = await buildFreshState(current.lat, current.lng, current.cityLabel, current.tz);
  try {
    await writeAmbientState(state);
  } catch {
    return json({ error: 'Redis 不可用' }, 503);
  }
  return json({ ok: true, updatedAt: state.updatedAt });
};
