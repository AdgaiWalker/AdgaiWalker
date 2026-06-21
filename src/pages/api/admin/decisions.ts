/**
 * POST /api/admin/decisions —— 创建 WorkItem 提案（P0-C02）
 *
 * 请求体：
 *   queue, title, summary, priorityBand, priorityReasons?, uncertainty?,
 *   evidenceRefs[], topicId?, requestDecision?
 *
 * actor 由服务端从会话派生，忽略客户端传入的 actor。
 * admin only；Cache-Control: no-store。
 */
import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { resolveAdminActor } from '@/lib/admin-actor';
import { createWorkbenchService } from '@/services/workbench.service';
import type {
  EvidenceRef,
  WorkItemPriorityBand,
  WorkItemQueue,
} from '@/stores/ports';

export const prerender = false;

const VALID_QUEUES: WorkItemQueue[] = ['user-demand', 'walker-thesis', 'system-event', 'ai-asset'];
const VALID_BANDS: WorkItemPriorityBand[] = ['now', 'week', 'observe', 'insufficient', 'blocked'];
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
  if (!isAdmin(request)) return json({ error: '未授权。' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误。' }, 400);
  }

  const queue = body.queue;
  if (typeof queue !== 'string' || !VALID_QUEUES.includes(queue as WorkItemQueue)) {
    return json({ error: 'queue 不合法。' }, 400);
  }
  if (typeof body.title !== 'string' || !body.title.trim()) {
    return json({ error: 'title 不能为空。' }, 400);
  }
  if (typeof body.summary !== 'string' || !body.summary.trim()) {
    return json({ error: 'summary 不能为空。' }, 400);
  }
  if (typeof body.priorityBand !== 'string' || !VALID_BANDS.includes(body.priorityBand as WorkItemPriorityBand)) {
    return json({ error: 'priorityBand 不合法。' }, 400);
  }
  if (!Array.isArray(body.evidenceRefs) || body.evidenceRefs.length === 0) {
    return json({ error: '提案必须至少引用一条证据。' }, 400);
  }

  const evidenceRefs = body.evidenceRefs.map(parseEvidenceRef).filter((e): e is EvidenceRef => e !== null);
  if (evidenceRefs.length === 0) {
    return json({ error: '证据引用格式不正确。' }, 400);
  }

  const actor = await resolveAdminActor(request);
  const service = createWorkbenchService();
  const result = await service.createProposal({
    queue: queue as WorkItemQueue,
    title: body.title,
    summary: body.summary,
    priorityBand: body.priorityBand as WorkItemPriorityBand,
    priorityReasons: Array.isArray(body.priorityReasons) ? body.priorityReasons.filter((r): r is string => typeof r === 'string') : [],
    uncertainty: Array.isArray(body.uncertainty) ? body.uncertainty.filter((r): r is string => typeof r === 'string') : [],
    evidenceRefs,
    topicId: typeof body.topicId === 'string' && body.topicId ? body.topicId : undefined,
    requestDecision: Boolean(body.requestDecision),
    actor,
  });

  if (!result.ok) {
    return json({ error: result.message ?? '创建失败。', code: result.code }, STATUS_BY_CODE[result.code] ?? 400);
  }
  return json({ ok: true, item: result.data }, 201);
};
