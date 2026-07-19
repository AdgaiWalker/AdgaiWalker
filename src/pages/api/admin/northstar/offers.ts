/**
 * /api/admin/northstar/offers —— NorthStar 商品/服务/能力发布（P5 spec §14）
 *
 * - GET    列出全部 offer
 * - POST   创建 offer（NorthStar 关闭时拒绝 northstar-disabled）
 * - PATCH  上下架（status: active|unlisted）
 * - DELETE ?offerId= 下架删除
 *
 * admin only；写操作门控 isNorthStarEnabled()。Cache-Control: no-store。
 */
import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';

import { isAdminAsync } from '@/lib/admin-auth';
import { resolveAdminActor } from '@/lib/admin-actor';
import { requireHighRiskAudit } from '@/lib/admin-audit';
import { captureException } from '@/lib/sentry';
import { createSessionStore } from '@/stores/session.store';
import { isNorthStarEnabled } from '@/lib/northstar-range';
import { findAllNorthStarOffers, findNorthStarOffer, saveNorthStarOffer } from '@/stores/northstar.store';
import type { NorthStarOffer, OfferKind } from '@/stores/ports';

const sessionStore = createSessionStore();

export const prerender = false;

const VALID_KINDS: OfferKind[] = ['product', 'service', 'capability'];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);
  const offers = await findAllNorthStarOffers();
  return json({ offers, count: offers.length, northstarEnabled: isNorthStarEnabled() });
};

export const POST: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);
  if (!isNorthStarEnabled()) return json({ error: 'NorthStar 经营范围未开启。', code: 'northstar-disabled' }, 409);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch (error) { captureException(error, { action: 'offer.publish' }); return json({ error: '请求格式错误。' }, 400); }
  const kind = body.kind as OfferKind;
  if (!VALID_KINDS.includes(kind)) return json({ error: 'kind 不合法（product/service/capability）。' }, 400);
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return json({ error: 'title 不能为空。' }, 400);
  const priceCents = Number(body.priceCents);
  if (!Number.isInteger(priceCents) || priceCents < 0) return json({ error: 'priceCents 必须是非负整数（分）。' }, 400);
  const currency = typeof body.currency === 'string' ? body.currency : 'CNY';
  const actor = await resolveAdminActor(request);
  const offerId = `offer_${randomUUID()}`;
  const audit = await requireHighRiskAudit({
    actor,
    action: 'offer.publish',
    targetType: 'offer',
    targetId: offerId,
    reason: '发布/修改/下架 offer 改变对外公开经营物。',
  });
  if (!audit.ok) return json({ ok: false, reason: audit.reason, code: audit.code }, audit.status);
  const offer: NorthStarOffer = {
    offerId,
    kind,
    title,
    description: typeof body.description === 'string' ? body.description : '',
    priceCents,
    currency,
    publishedBy: actor,
    publishedAt: new Date().toISOString(),
    status: 'active',
  };
  await saveNorthStarOffer(offer);
  return json({ ok: true, offer }, 201);
};

export const PATCH: APIRoute = async ({ request, url }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);
  if (!isNorthStarEnabled()) return json({ error: 'NorthStar 经营范围未开启。', code: 'northstar-disabled' }, 409);
  const offerId = url.searchParams.get('offerId');
  if (!offerId) return json({ error: 'offerId 不能为空。' }, 400);
  let body: { status?: string };
  try { body = await request.json(); } catch (error) { captureException(error, { action: 'offer.update' }); return json({ error: '请求格式错误。' }, 400); }
  if (body.status !== 'active' && body.status !== 'unlisted') return json({ error: 'status 不合法。' }, 400);
  const existing = await findNorthStarOffer(offerId);
  if (!existing) return json({ error: 'offer 不存在。', code: 'not-found' }, 404);
  const actor = await resolveAdminActor(request);
  const audit = await requireHighRiskAudit({
    actor,
    action: 'offer.update',
    targetType: 'offer',
    targetId: offerId,
    reason: '发布/修改/下架 offer 改变对外公开经营物。',
  });
  if (!audit.ok) return json({ ok: false, reason: audit.reason, code: audit.code }, audit.status);
  await saveNorthStarOffer({ ...existing, status: body.status });
  return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request, url }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);
  if (!isNorthStarEnabled()) return json({ error: 'NorthStar 经营范围未开启。', code: 'northstar-disabled' }, 409);
  const offerId = url.searchParams.get('offerId');
  if (!offerId) return json({ error: 'offerId 不能为空。' }, 400);
  const existing = await findNorthStarOffer(offerId);
  if (!existing) return json({ error: 'offer 不存在。', code: 'not-found' }, 404);
  const actor = await resolveAdminActor(request);
  const audit = await requireHighRiskAudit({
    actor,
    action: 'offer.unlist',
    targetType: 'offer',
    targetId: offerId,
    reason: '发布/修改/下架 offer 改变对外公开经营物。',
  });
  if (!audit.ok) return json({ ok: false, reason: audit.reason, code: audit.code }, audit.status);
  await saveNorthStarOffer({ ...existing, status: 'unlisted' });
  return json({ ok: true });
};
