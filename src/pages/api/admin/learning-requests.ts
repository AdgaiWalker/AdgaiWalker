/**
 * /api/admin/learning-requests —— 学习请求（P2-B）
 *
 * GET  ?status=open|in-progress|fulfilled|dropped   列表（默认全部最近）
 * POST { evidenceGap, context, expectedEvidence, topicId?, assetKind?, assetId?, workItemId? }  创建
 * PATCH { requestId, fulfillmentNote }  完成补证
 *
 * admin only；Cache-Control: no-store。
 */
import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { createAssetService } from '@/services/asset.service';
import type { LearningRequest } from '@/stores/ports';

export const prerender = false;

const VALID_GAPS: LearningRequest['evidenceGap'][] = ['practice', 'counter-example', 'interview', 'outcome', 'boundary'];
const VALID_STATUSES: LearningRequest['status'][] = ['open', 'in-progress', 'fulfilled', 'dropped'];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!isAdmin(request)) return json({ error: '未授权。' }, 401);
  const statusParam = url.searchParams.get('status');
  const status = statusParam && VALID_STATUSES.includes(statusParam as LearningRequest['status'])
    ? (statusParam as LearningRequest['status'])
    : undefined;
  const service = createAssetService();
  const items = await service.listLearningRequests(status);
  return json({ items, count: items.length });
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) return json({ error: '未授权。' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误。' }, 400);
  }

  if (typeof body.evidenceGap !== 'string' || !VALID_GAPS.includes(body.evidenceGap as LearningRequest['evidenceGap'])) {
    return json({ error: 'evidenceGap 不合法。' }, 400);
  }
  if (typeof body.context !== 'string' || !body.context.trim()) {
    return json({ error: 'context 不能为空。' }, 400);
  }
  if (typeof body.expectedEvidence !== 'string' || !body.expectedEvidence.trim()) {
    return json({ error: 'expectedEvidence 不能为空。' }, 400);
  }

  const service = createAssetService();
  const request_ = await service.createLearningRequest({
    evidenceGap: body.evidenceGap as LearningRequest['evidenceGap'],
    context: body.context,
    expectedEvidence: body.expectedEvidence,
    topicId: typeof body.topicId === 'string' && body.topicId ? body.topicId : undefined,
    assetKind: body.assetKind === 'experience' || body.assetKind === 'rule' || body.assetKind === 'skill' ? body.assetKind : undefined,
    assetId: typeof body.assetId === 'string' && body.assetId ? body.assetId : undefined,
    workItemId: typeof body.workItemId === 'string' && body.workItemId ? body.workItemId : undefined,
  });
  return json({ ok: true, request: request_ }, 201);
};

export const PATCH: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) return json({ error: '未授权。' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误。' }, 400);
  }

  if (typeof body.requestId !== 'string' || !body.requestId) {
    return json({ error: 'requestId 不能为空。' }, 400);
  }
  if (typeof body.fulfillmentNote !== 'string' || !body.fulfillmentNote.trim()) {
    return json({ error: 'fulfillmentNote 不能为空。' }, 400);
  }

  const service = createAssetService();
  const result = await service.fulfillLearningRequest(body.requestId, body.fulfillmentNote);
  if (!result.ok) {
    const codeToStatus: Record<string, number> = { ok: 200, 'not-found': 404, 'invalid-stage': 400, 'missing-evidence': 409, 'storage-unavailable': 503 };
    return json({ error: result.message ?? '完成失败。', code: result.code }, codeToStatus[result.code] ?? 400);
  }
  return json({ ok: true, request: result.data });
};
