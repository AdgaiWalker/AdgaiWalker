import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';

import { isAdmin } from '@/lib/admin-auth';
import { saveSkillCandidate, findRecentSkillCandidates, updateSkillAdmission } from '@/conversation/store';
import type { SkillCandidate, SkillAdmissionStatus } from '@/stores/ports';

export const prerender = false;

const VALID_ADMISSION = new Set<SkillAdmissionStatus>(['candidate', 'admitted', 'demoted-to-method']);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** GET /api/admin/skills — Skill 候选列表（admin 准入判断 + 方法卡用） */
export const GET: APIRoute = async ({ request, url }) => {
  if (!isAdmin(request)) return json({ error: 'unauthorized' }, 401);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 100)));
  const skills = await findRecentSkillCandidates(limit);
  return json({ skills });
};

/** POST /api/admin/skills — 创建/更新 Skill 候选；?action=admission 时切换准入状态 */
export const POST: APIRoute = async ({ request, url }) => {
  if (!isAdmin(request)) return json({ error: 'unauthorized' }, 401);

  if (url.searchParams.get('action') === 'admission') {
    let body: { skillId?: string; admissionStatus?: string };
    try { body = await request.json(); } catch { return json({ error: 'invalid' }, 400); }
    if (!body.skillId || !VALID_ADMISSION.has(body.admissionStatus as SkillAdmissionStatus)) {
      return json({ error: 'skillId/admissionStatus 必填' }, 400);
    }
    await updateSkillAdmission(body.skillId, body.admissionStatus as SkillAdmissionStatus);
    return json({ ok: true });
  }

  let body: Partial<SkillCandidate> & { skillId?: string };
  try { body = await request.json(); } catch { return json({ error: 'invalid' }, 400); }

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
