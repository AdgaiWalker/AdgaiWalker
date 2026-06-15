import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { createIncidentStore } from '@/stores/incident.store';

export const prerender = false;

/**
 * GET /api/admin/incidents — 未解决的安全事件/失败降级记录（Incident）。
 *
 * 供 admin 待复盘视图读取。Incident 由 orchestrator 在关键失败时记录
 * （如 NeedCase 保存失败、画像保存失败等，见 auth-encounter-prd §7.4 失败矩阵）。
 * admin only。
 */
export const GET: APIRoute = async ({ request, url }) => {
  if (!isAdmin(request)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
  const incidents = await createIncidentStore().findUnresolved(limit);

  return new Response(JSON.stringify({ incidents }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
