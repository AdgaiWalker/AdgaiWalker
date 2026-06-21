/**
 * /api/admin/appearance/media —— 后台媒体文件读取（UX1）
 *
 * 媒体文件本体不作为公开静态资源暴露；后台只通过 Admin 权限读取当前 actor 可见的媒体。
 */
import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { resolveAdminActor } from '@/lib/admin-actor';
import { createAppearanceService } from '@/services/appearance.service';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const CODE_STATUS: Record<string, number> = {
  'not-found': 404,
  'storage-unavailable': 503,
};

export const GET: APIRoute = async ({ request, url }) => {
  if (!isAdmin(request)) return json({ error: '未授权。' }, 401);
  const assetId = url.searchParams.get('assetId');
  if (!assetId) return json({ error: 'assetId 不能为空。' }, 400);

  const owner = await resolveAdminActor(request);
  const result = await createAppearanceService().readMedia(owner, assetId);
  if (!result.ok || !result.data) {
    return json({ error: result.message, code: result.code }, CODE_STATUS[result.code] ?? 400);
  }

  return new Response(Buffer.from(result.data.bytes), {
    status: 200,
    headers: {
      'Content-Type': result.data.asset.mimeType,
      'Content-Length': String(result.data.bytes.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
