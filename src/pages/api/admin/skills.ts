import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';

import { isAdminAsync } from '@/lib/admin-auth';
import { createSessionStore } from '@/stores/session.store';
import { captureException } from '@/lib/sentry';
import { requireHighRiskAudit } from '@/lib/admin-audit';
import { resolveAdminActor } from '@/lib/admin-actor';
import { saveSkillCandidate, findRecentSkillCandidates, updateSkillAdmission, updateSkillRegistration } from '@/stores/skill-candidate.store';
import { createAssetService, validateSkillRegistration } from '@/services/asset.service';
import type { SkillCandidate, SkillAdmissionStatus, SkillAdmissionSnapshot } from '@/stores/ports';

export const prerender = false;

const sessionStore = createSessionStore();

const VALID_ADMISSION = new Set<SkillAdmissionStatus>(['candidate', 'admitted', 'demoted-to-method']);
const VALID_EVAL_CATEGORIES = new Set(['normal', 'boundary', 'reject', 'failure']);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** GET /api/admin/skills — Skill 候选列表（admin 准入判断 + 方法卡用） */
export const GET: APIRoute = async ({ request, url }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: 'unauthorized' }, 401);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 100)));
  const skills = await findRecentSkillCandidates(limit);
  return json({ skills });
};

/** POST /api/admin/skills — 创建/更新 Skill 候选；?action=admission 时切换准入状态 */
export const POST: APIRoute = async ({ request, url }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: 'unauthorized' }, 401);

  if (url.searchParams.get('action') === 'admission') {
    let body: { skillId?: string; admissionStatus?: string; skillRegistration?: Record<string, unknown> };
    try { body = await request.json(); } catch (error) { captureException(error, { action: 'skills.admission' }); return json({ error: 'invalid' }, 400); }
    if (!body.skillId || !VALID_ADMISSION.has(body.admissionStatus as SkillAdmissionStatus)) {
      return json({ error: 'skillId/admissionStatus 必填' }, 400);
    }
    const actor = await resolveAdminActor(request);
    const audit = await requireHighRiskAudit({
      actor, action: 'skill.admission', targetType: 'skill', targetId: body.skillId,
      reason: '切换 Skill 准入状态改变能力发布边界。'
    });
    if (!audit.ok) return json({ ok:false, reason:audit.reason, code:audit.code }, audit.status);
    // P4 守护（防旁路）：准入到 admitted 必须有 boundary/反例/evalSet。
    // 与 /api/admin/assets/promote 共用 validateSkillRegistration，确保 skills 页这条路径不被绕过。
    if (body.admissionStatus === 'admitted') {
      const regRaw = body.skillRegistration;
      const reg = regRaw && typeof regRaw === 'object' ? {
        applicableBoundary: typeof regRaw.applicableBoundary === 'string' ? regRaw.applicableBoundary : '',
        failureBoundary: typeof regRaw.failureBoundary === 'string' ? regRaw.failureBoundary : '',
        negativeExamples: Array.isArray(regRaw.negativeExamples) ? regRaw.negativeExamples.filter((s): s is string => typeof s === 'string') : [],
        evalSet: Array.isArray(regRaw.evalSet)
          ? regRaw.evalSet
              .map((e): { category: string } | null => {
                if (!e || typeof e !== 'object') return null;
                const o = e as Record<string, unknown>;
                return typeof o.category === 'string' && VALID_EVAL_CATEGORIES.has(o.category) ? { category: o.category } : null;
              })
              .filter((e): e is { category: string } => e !== null)
          : [],
      } : undefined;
      const code = validateSkillRegistration(reg);
      if (code) {
        const msg = code === 'missing-boundary'
          ? '注册 Skill 前必须提供适用边界与失败边界。'
          : code === 'missing-counterexample'
            ? '注册 Skill 前必须提供至少一条反例。'
            : '注册 Skill 前必须提供覆盖 normal/boundary/reject/failure 四类的验证集。';
        return json({ error: msg, code }, 409);
      }
      // 走带快照的注册路径（写 boundary/反例/evalSet + 准入快照，便于暂停/回滚）
      const snapshot: SkillAdmissionSnapshot = {
        version: 1,
        admissionStatus: 'admitted',
        registrationTier: 'limited',
        capturedAt: new Date().toISOString(),
        reason: 'skills 页准入注册',
      };
      await updateSkillRegistration(body.skillId, {
        admissionStatus: 'admitted',
        registrationTier: 'limited',
        applicableBoundary: reg!.applicableBoundary,
        failureBoundary: reg!.failureBoundary,
        negativeExamples: reg!.negativeExamples,
        evalSet: (body.skillRegistration?.evalSet as { input: string; expectedOutput: string; category: 'normal' | 'boundary' | 'reject' | 'failure' }[]) ?? [],
        snapshot,
      });
      return json({ ok: true });
    }
    await updateSkillAdmission(body.skillId, body.admissionStatus as SkillAdmissionStatus);
    return json({ ok: true });
  }

  // P4：暂停 / 恢复 / 回滚已注册 Skill（spec §28 受控注册）
  const actionLifecycle = url.searchParams.get('action');
  if (actionLifecycle === 'pause' || actionLifecycle === 'resume' || actionLifecycle === 'rollback') {
    let body: { skillId?: string; reason?: string; toVersion?: number };
    try { body = await request.json(); } catch (error) { captureException(error, { action: 'skills.lifecycle' }); return json({ error: 'invalid' }, 400); }
    if (!body.skillId) return json({ error: 'skillId 必填' }, 400);
    if (!body.reason?.trim()) return json({ error: 'reason 必填' }, 400);
    const svc = createAssetService();
    let result;
    if (actionLifecycle === 'pause') result = await svc.pauseSkill(body.skillId, body.reason);
    else if (actionLifecycle === 'resume') result = await svc.resumeSkill(body.skillId, body.reason);
    else result = await svc.rollbackSkill(body.skillId, Number(body.toVersion), body.reason);
    if (!result.ok) return json({ error: result.message ?? '操作失败', code: result.code }, 400);
    return json({ ok: true });
  }

  let body: Partial<SkillCandidate> & { skillId?: string };
  try { body = await request.json(); } catch (error) { captureException(error, { action: 'skills.create' }); return json({ error: 'invalid' }, 400); }

  // 更新现有 Skill 时保留原始字段（避免版本迭代等部分更新覆盖定义域/输入条件/输出形态/准入状态）
  const existing = body.skillId
    ? (await findRecentSkillCandidates(500)).find(s => s.skillId === body.skillId)
    : undefined;

  const name = typeof body.name === 'string' ? body.name : existing?.name;
  if (!name) {
    return json({ error: 'name 必填' }, 400);
  }

  const now = new Date().toISOString();
  const skill: SkillCandidate = {
    skillId: body.skillId ?? randomUUID(),
    createdAt: existing?.createdAt ?? body.createdAt ?? now,
    updatedAt: now,
    name: name.slice(0, 120),
    description: (body.description ?? existing?.description ?? '').slice(0, 1000),
    admissionStatus: body.admissionStatus ?? existing?.admissionStatus ?? 'candidate',
    domain: (body.domain ?? existing?.domain ?? '').slice(0, 500),
    inputConditions: (body.inputConditions ?? existing?.inputConditions ?? '').slice(0, 800),
    outputForm: (body.outputForm ?? existing?.outputForm ?? '').slice(0, 800),
    validationCriteria: (body.validationCriteria ?? existing?.validationCriteria ?? '').slice(0, 800),
    sourceExperienceIds: body.sourceExperienceIds ?? existing?.sourceExperienceIds ?? [],
    version: typeof body.version === 'number' ? body.version : (existing?.version ?? 1),
  };
  await saveSkillCandidate(skill);
  return json({ ok: true, skillId: skill.skillId });
};
