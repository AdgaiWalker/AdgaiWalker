import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';

import { isAdmin } from '@/lib/admin-auth';
import { saveExperienceEvent, findRecentExperienceEvents, updateExperienceEvent } from '@/conversation/store';
import type { ExperienceEvent, ExperienceFeedbackResult } from '@/stores/ports';

export const prerender = false;

const VALID_RESULTS = new Set<ExperienceFeedbackResult>(['success', 'failure', 'no-feedback', 'pending']);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * POST /api/admin/experience-events — 采集原始经验事件（U10）。
 * 保存用户原话（保真）+ 场景标注 + 初步判断 + 帮助动作 + 反馈结果。
 * admin only。
 */
export const POST: APIRoute = async ({ request, url }) => {
  if (!isAdmin(request)) return json({ error: 'unauthorized' }, 401);

  // ?action=update — 复盘 / 模式标记 / 成熟度 / 反馈结果更新
  if (url.searchParams.get('action') === 'update') {
    let body: { experienceId?: string; reflection?: string; patternMarked?: boolean; maturity?: string; feedbackResult?: string };
    try { body = await request.json(); } catch { return json({ error: 'invalid' }, 400); }
    if (!body.experienceId) return json({ error: 'experienceId 必填' }, 400);
    const patch: { reflection?: string; patternMarked?: boolean; maturity?: ExperienceEvent['maturity']; feedbackResult?: ExperienceFeedbackResult } = {};
    if (typeof body.reflection === 'string') patch.reflection = body.reflection.slice(0, 2000);
    if (typeof body.patternMarked === 'boolean') patch.patternMarked = body.patternMarked;
    if (body.maturity) patch.maturity = body.maturity as ExperienceEvent['maturity'];
    if (body.feedbackResult && VALID_RESULTS.has(body.feedbackResult as ExperienceFeedbackResult)) {
      patch.feedbackResult = body.feedbackResult as ExperienceFeedbackResult;
    }
    if (Object.keys(patch).length === 0) return json({ error: '无可更新字段' }, 400);
    await updateExperienceEvent(body.experienceId, patch);
    return json({ ok: true });
  }

  let body: {
    source?: string;
    rawQuote?: string;
    surfaceNeed?: string;
    scenarioNote?: string;
    initialHypothesis?: string;
    helpAction?: string;
    feedbackResult?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid' }, 400);
  }

  if (!body.rawQuote || typeof body.rawQuote !== 'string') {
    return json({ error: 'rawQuote 必填' }, 400);
  }

  const feedbackResult: ExperienceFeedbackResult = VALID_RESULTS.has(body.feedbackResult as ExperienceFeedbackResult)
    ? (body.feedbackResult as ExperienceFeedbackResult)
    : 'pending';

  const now = new Date().toISOString();
  const event: ExperienceEvent = {
    experienceId: randomUUID(),
    createdAt: now,
    updatedAt: now,
    source: body.source ?? '其他',
    rawQuote: body.rawQuote.slice(0, 1000),
    surfaceNeed: body.surfaceNeed,
    scenarioNote: body.scenarioNote,
    initialHypothesis: body.initialHypothesis,
    helpAction: body.helpAction,
    feedbackResult,
    patternMarked: false,
  };

  await saveExperienceEvent(event);
  return json({ ok: true, experienceId: event.experienceId });
};

/**
 * GET /api/admin/experience-events — 经验事件列表（admin 复盘用）。
 */
export const GET: APIRoute = async ({ request, url }) => {
  if (!isAdmin(request)) return json({ error: 'unauthorized' }, 401);

  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
  const events = await findRecentExperienceEvents(limit);
  return json({ events });
};
