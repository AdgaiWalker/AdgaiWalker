/**
 * POST /api/admin/outcomes —— 为已执行的行动记录结果（P0-C02）
 *
 * 请求体：
 *   workItemId, actionId, result, summary, evidenceRefs[], nextDecisionSuggested?
 *
 * actor 由服务端派生。admin only；Cache-Control: no-store。
 */
import type { APIRoute } from 'astro';

import { isAdminAsync } from '@/lib/admin-auth';
import { resolveAdminActor } from '@/lib/admin-actor';
import { captureException } from '@/lib/sentry';
import { createWorkbenchService } from '@/services/workbench.service';
import { createSessionStore } from '@/stores/session.store';
import type { EvidenceRef, WorkItemOutcomeResult } from '@/stores/ports';

export const prerender = false;

const sessionStore = createSessionStore();

const VALID_RESULTS: WorkItemOutcomeResult[] = ['successful', 'partial', 'failed', 'inconclusive'];
const VALID_SOURCE_TYPES = ['need-case', 'walker-thesis', 'content-feedback', 'match-feedback', 'incident', 'experience', 'agent-call'];

const STATUS_BY_CODE: Record<string, number> = {
  ok: 201,
  'not-found': 404,
  'invalid-transition': 409,
  'missing-evidence': 409,
  'missing-expected-outcome': 409,
  'storage-unavailable': 503,
  'invalid-input': 400,
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function parseEvidenceRef(raw: unknown): EvidenceRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.evidenceId !== 'string' || !r.evidenceId) return null;
  if (typeof r.sourceType !== 'string' || !VALID_SOURCE_TYPES.includes(r.sourceType)) return null;
  if (typeof r.sourceId !== 'string' || !r.sourceId) return null;
  if (typeof r.occurredAt !== 'string') return null;
  if (typeof r.summary !== 'string') return null;
  return {
    evidenceId: r.evidenceId,
    sourceType: r.sourceType as EvidenceRef['sourceType'],
    sourceId: r.sourceId,
    occurredAt: r.occurredAt,
    collectedAt: typeof r.collectedAt === 'string' ? r.collectedAt : new Date().toISOString(),
    environment: (r.environment as EvidenceRef['environment']) ?? 'production',
    visibility: (r.visibility as EvidenceRef['visibility']) ?? 'owner',
    freshness: (r.freshness as EvidenceRef['freshness']) ?? 'unknown',
    qualityStatus: (r.qualityStatus as EvidenceRef['qualityStatus']) ?? 'unverified',
    summary: r.summary,
  };
}

export const POST: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch (error) {
    captureException(error, { action: 'outcomes.create' });
    return json({ error: '请求格式错误。' }, 400);
  }

  if (typeof body.workItemId !== 'string' || !body.workItemId) {
    return json({ error: 'workItemId 不能为空。' }, 400);
  }
  if (typeof body.actionId !== 'string' || !body.actionId) {
    return json({ error: 'actionId 不能为空。' }, 400);
  }
  if (typeof body.result !== 'string' || !VALID_RESULTS.includes(body.result as WorkItemOutcomeResult)) {
    return json({ error: 'result 不合法。' }, 400);
  }
  if (typeof body.summary !== 'string' || !body.summary.trim()) {
    return json({ error: 'summary 不能为空。' }, 400);
  }
  if (!Array.isArray(body.evidenceRefs) || body.evidenceRefs.length === 0) {
    return json({ error: '结果必须引用至少一条证据。' }, 400);
  }

  const evidenceRefs = body.evidenceRefs.map(parseEvidenceRef).filter((e): e is EvidenceRef => e !== null);
  if (evidenceRefs.length === 0) {
    return json({ error: '证据引用格式不正确。' }, 400);
  }

  const actor = await resolveAdminActor(request);
  const service = createWorkbenchService();
  const result = await service.recordOutcome(body.workItemId, {
    actionId: body.actionId,
    result: body.result as WorkItemOutcomeResult,
    summary: body.summary,
    evidenceRefs,
    actor,
    nextDecisionSuggested: body.nextDecisionSuggested === true ? true : undefined,
  });

  if (!result.ok) {
    return json({ error: result.message ?? '记录结果失败。', code: result.code }, STATUS_BY_CODE[result.code] ?? 400);
  }
  return json({ ok: true, item: result.data }, 201);
};
