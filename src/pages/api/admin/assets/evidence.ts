/**
 * GET /api/admin/assets/evidence?kind=&assetId= —— 查看某资产由哪些 Outcome/Experience 支持（P2-B）
 *
 * 方案明确要求"能查看某个 Skill 是由哪些 Outcome 支持的"。
 * admin only；Cache-Control: no-store。
 */
import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { createAssetService } from '@/services/asset.service';
import type { AssetKind } from '@/stores/ports';

export const prerender = false;

const VALID_KINDS: AssetKind[] = ['experience', 'rule', 'skill'];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!isAdmin(request)) return json({ error: '未授权。' }, 401);

  const kind = url.searchParams.get('kind');
  const assetId = url.searchParams.get('assetId');
  if (!kind || !VALID_KINDS.includes(kind as AssetKind)) {
    return json({ error: 'kind 不合法（experience/rule/skill）。' }, 400);
  }
  if (!assetId) {
    return json({ error: 'assetId 不能为空。' }, 400);
  }

  const service = createAssetService();
  const links = await service.getSupportingEvidence(kind as AssetKind, assetId);
  return json({ kind, assetId, links, count: links.length });
};
