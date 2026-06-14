/**
 * GET/POST /api/admin/review — 后台 Need Case 复盘
 *
 * GET  : ?status=pending|all &limit → 返回 Need Case 列表（含反馈）
 * POST : { needCaseId, status, note? } → 更新 review 状态
 *
 * 仅 admin cookie 可访问。
 */

import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { createAdminReviewService } from '@/services/admin-review.service';
import { createFeedbackStore } from '@/stores/feedback.store';
import { createNeedCaseStore } from '@/stores/need-case.store';
import type { AdminReviewStatus } from '@/stores/ports';

const adminReviewService = createAdminReviewService({
  needCaseStore: createNeedCaseStore(),
  feedbackStore: createFeedbackStore(),
});

const VALID_STATUSES: AdminReviewStatus[] = ['pending', 'accepted', 'deferred', 'ignored'];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!isAdmin(request)) {
    return json({ error: '未授权。' }, 401);
  }

  const status = url.searchParams.get('status') ?? 'pending';
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));

  if (status === 'all') {
    const items = await adminReviewService.listAll({ limit });
    return json({ items, count: items.length });
  }

  const items = await adminReviewService.listPending({ limit });
  return json({ items, count: items.length });
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) {
    return json({ error: '未授权。' }, 401);
  }

  let body: { needCaseId?: unknown; status?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式不正确。' }, 400);
  }

  if (typeof body.needCaseId !== 'string' || !body.needCaseId) {
    return json({ error: '缺少 needCaseId。' }, 400);
  }
  if (typeof body.status !== 'string' || !VALID_STATUSES.includes(body.status as AdminReviewStatus)) {
    return json({ error: `status 只能是 ${VALID_STATUSES.join('/')}` }, 400);
  }
  if (body.note !== undefined && typeof body.note !== 'string') {
    return json({ error: 'note 必须是字符串。' }, 400);
  }

  const ok = await adminReviewService.updateReview(
    body.needCaseId,
    body.status as AdminReviewStatus,
    typeof body.note === 'string' ? body.note : undefined,
  );

  return json({ ok, needCaseId: body.needCaseId, status: body.status });
};
