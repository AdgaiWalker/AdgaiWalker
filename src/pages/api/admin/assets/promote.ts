/**
 * POST /api/admin/assets/promote —— 资产晋升（P2-B + P4 注册护栏）
 *
 * 请求体：
 *   assetKind (experience|rule|skill), assetId, toStage (AssetLifecycleStage),
 *   sourceOutcomeIds?, sourceExperienceIds?, reason,
 *   skillRegistration?（注册 Skill 到 validated/stable 时必填：
 *     applicableBoundary, failureBoundary, negativeExamples[], evalSet[{input,expectedOutput,category}]）
 *
 * actor（Walker 批准人）由服务端派生。注册 Skill 前必须有支撑证据 + 边界 + 反例 + 验证集。
 * admin only；Cache-Control: no-store。
 */
import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { resolveAdminActor } from '@/lib/admin-actor';
import { createAssetService } from '@/services/asset.service';
import type { AssetKind, AssetLifecycleStage, SkillEvalCase } from '@/stores/ports';

export const prerender = false;

const VALID_KINDS: AssetKind[] = ['experience', 'rule', 'skill'];
const VALID_STAGES: AssetLifecycleStage[] = ['observed', 'candidate', 'validated', 'stable', 'retired'];
const VALID_EVAL_CATEGORIES: SkillEvalCase['category'][] = ['normal', 'boundary', 'reject', 'failure'];

const STATUS_BY_CODE: Record<string, number> = {
  ok: 201,
  'not-found': 404,
  'invalid-input': 400,
  'invalid-stage': 400,
  'missing-evidence': 409,
  'missing-boundary': 409,
  'missing-counterexample': 409,
  'missing-eval-set': 409,
  'storage-unavailable': 503,
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function asStringArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : undefined;
}

function parseSkillRegistration(body: Record<string, unknown>) {
  const reg = body.skillRegistration;
  if (!reg || typeof reg !== 'object') return undefined;
  const r = reg as Record<string, unknown>;
  const evalSet = Array.isArray(r.evalSet)
    ? r.evalSet
        .map((e): SkillEvalCase | null => {
          if (!e || typeof e !== 'object') return null;
          const o = e as Record<string, unknown>;
          if (typeof o.input !== 'string' || typeof o.expectedOutput !== 'string' || typeof o.category !== 'string') return null;
          if (!VALID_EVAL_CATEGORIES.includes(o.category as SkillEvalCase['category'])) return null;
          return { input: o.input, expectedOutput: o.expectedOutput, category: o.category as SkillEvalCase['category'] };
        })
        .filter((e): e is SkillEvalCase => e !== null)
    : [];
  return {
    applicableBoundary: typeof r.applicableBoundary === 'string' ? r.applicableBoundary : '',
    failureBoundary: typeof r.failureBoundary === 'string' ? r.failureBoundary : '',
    positiveExamples: asStringArray(r.positiveExamples),
    negativeExamples: asStringArray(r.negativeExamples) ?? [],
    evalSet,
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

  if (typeof body.assetKind !== 'string' || !VALID_KINDS.includes(body.assetKind as AssetKind)) {
    return json({ error: 'assetKind 不合法（experience/rule/skill）。' }, 400);
  }
  if (typeof body.assetId !== 'string' || !body.assetId.trim()) {
    return json({ error: 'assetId 不能为空。' }, 400);
  }
  if (typeof body.toStage !== 'string' || !VALID_STAGES.includes(body.toStage as AssetLifecycleStage)) {
    return json({ error: 'toStage 不合法（observed/candidate/validated/stable/retired）。' }, 400);
  }
  if (typeof body.reason !== 'string' || !body.reason.trim()) {
    return json({ error: 'reason 不能为空。' }, 400);
  }

  const sourceOutcomeIds = Array.isArray(body.sourceOutcomeIds)
    ? body.sourceOutcomeIds.filter((s): s is string => typeof s === 'string')
    : [];
  const sourceExperienceIds = Array.isArray(body.sourceExperienceIds)
    ? body.sourceExperienceIds.filter((s): s is string => typeof s === 'string')
    : [];

  const actor = await resolveAdminActor(request);
  const service = createAssetService();
  const result = await service.promote({
    assetKind: body.assetKind as AssetKind,
    assetId: body.assetId,
    toStage: body.toStage as AssetLifecycleStage,
    sourceOutcomeIds,
    sourceExperienceIds,
    approvedBy: actor,
    reason: body.reason,
    workItemId: typeof body.workItemId === 'string' && body.workItemId ? body.workItemId : undefined,
    skillRegistration: parseSkillRegistration(body),
  });

  if (!result.ok) {
    return json({ error: result.message ?? '晋升失败。', code: result.code }, STATUS_BY_CODE[result.code] ?? 400);
  }
  return json({ ok: true, link: result.data }, 201);
};
