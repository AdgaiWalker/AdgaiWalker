import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';

import { isAdminAsync } from '@/lib/admin-auth';
import { createSessionStore } from '@/stores/session.store';
import { captureException } from '@/lib/sentry';
import { saveRuleCandidate, findRecentRuleCandidates, updateRuleStatus } from '@/stores/rule-candidate.store';
import type { RuleCandidate, RuleStatus } from '@/stores/ports';

export const prerender = false;

const sessionStore = createSessionStore();

const VALID_STATUSES = new Set<RuleStatus>(['observed', 'candidate', 'validated', 'stable', 'retired']);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** GET /api/admin/rules — 规则候选列表（admin 复盘 + 评测用） */
export const GET: APIRoute = async ({ request, url }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: 'unauthorized' }, 401);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 100)));
  const rules = await findRecentRuleCandidates(limit);
  return json({ rules });
};

/** POST /api/admin/rules — 创建/更新规则候选；?action=status 时切换状态 */
export const POST: APIRoute = async ({ request, url }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: 'unauthorized' }, 401);

  if (url.searchParams.get('action') === 'status') {
    let body: { ruleId?: string; status?: string; note?: string };
    try { body = await request.json(); } catch (error) { captureException(error, { action: 'rules.status' }); return json({ error: 'invalid' }, 400); }
    if (!body.ruleId || !VALID_STATUSES.has(body.status as RuleStatus)) {
      return json({ error: 'ruleId/status 必填' }, 400);
    }
    await updateRuleStatus(body.ruleId, body.status as RuleStatus, body.note);
    return json({ ok: true });
  }

  let body: Partial<RuleCandidate> & { ruleId?: string };
  try { body = await request.json(); } catch (error) { captureException(error, { action: 'rules.create' }); return json({ error: 'invalid' }, 400); }

  // 更新现有规则时保留原始字段（避免部分更新覆盖 createdAt / 正反例 / 来源）
  const existing = body.ruleId
    ? (await findRecentRuleCandidates(500)).find(r => r.ruleId === body.ruleId)
    : undefined;

  const description = typeof body.description === 'string' ? body.description : existing?.description;
  if (!description) {
    return json({ error: 'description 必填' }, 400);
  }

  const now = new Date().toISOString();
  const rule: RuleCandidate = {
    ruleId: body.ruleId ?? randomUUID(),
    createdAt: existing?.createdAt ?? body.createdAt ?? now,
    updatedAt: now,
    description: description.slice(0, 500),
    status: body.status ?? existing?.status ?? 'observed',
    positiveExamples: body.positiveExamples ?? existing?.positiveExamples ?? [],
    negativeExamples: body.negativeExamples ?? existing?.negativeExamples ?? [],
    sourceIds: body.sourceIds ?? existing?.sourceIds ?? [],
    accuracy: body.accuracy ?? existing?.accuracy,
    note: body.note ?? existing?.note,
  };
  await saveRuleCandidate(rule);
  return json({ ok: true, ruleId: rule.ruleId });
};
