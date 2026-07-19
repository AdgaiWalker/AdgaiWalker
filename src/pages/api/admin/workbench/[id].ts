/**
 * GET /api/admin/workbench/[id] —— 获取单个 WorkItem 详情（P0-C02）
 *
 * admin only；Cache-Control: no-store。
 */
import type { APIRoute } from 'astro';

import { isAdminAsync } from '@/lib/admin-auth';
import { createWorkbenchService } from '@/services/workbench.service';
import { createSessionStore } from '@/stores/session.store';

export const prerender = false;

const sessionStore = createSessionStore();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ request, params }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);

  const id = params.id;
  if (!id) return json({ error: '缺少工作项 ID。' }, 400);

  const item = await createWorkbenchService().findById(id);
  if (!item) return json({ error: '工作项不存在。' }, 404);

  return json({ item });
};
