/**
 * /api/admin/northstar/orders —— NorthStar 订单/支付/履约/退款（P5 spec §14）
 *
 * - GET                    列出订单
 * - POST  ?action=create   创建订单（需 offerId + buyerHandle + quantity）
 * - POST  ?action=pay      发起支付（created→paying→paid，合成 provider 即时成功）
 * - POST  ?action=fulfill  履约（paid→fulfilled）
 * - POST  ?action=refund   退款（paid|fulfilled→refunded，需 reason）
 *
 * admin only；全部写操作门控 isNorthStarEnabled()（OFF 时 northstar-disabled，个人闭环完整）。
 * 真实支付商 webhook 确认（paying→paid）待真实商接入后补 webhook 路由 + 签名验证。
 * Cache-Control: no-store。
 */
import type { APIRoute } from 'astro';

import { isAdmin } from '@/lib/admin-auth';
import { isNorthStarEnabled } from '@/lib/northstar-range';
import { createNorthStarService } from '@/services/northstar.service';
import { findNorthStarOffer, findRecentNorthStarOrders } from '@/conversation/store';

export const prerender = false;

const STATUS_BY_CODE: Record<string, number> = {
  ok: 200,
  'northstar-disabled': 409,
  'not-found': 404,
  'invalid-input': 400,
  'invalid-transition': 409,
  'provider-error': 502,
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) return json({ error: '未授权。' }, 401);
  const orders = await findRecentNorthStarOrders(100);
  return json({ orders, count: orders.length, northstarEnabled: isNorthStarEnabled() });
};

export const POST: APIRoute = async ({ request, url }) => {
  if (!isAdmin(request)) return json({ error: '未授权。' }, 401);
  if (!isNorthStarEnabled()) return json({ error: 'NorthStar 经营范围未开启。', code: 'northstar-disabled' }, 409);
  const action = url.searchParams.get('action') ?? 'create';
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误。' }, 400); }

  const svc = createNorthStarService();

  if (action === 'create') {
    const offerId = typeof body.offerId === 'string' ? body.offerId : '';
    const offer = await findNorthStarOffer(offerId);
    if (!offer) return json({ error: 'offer 不存在。', code: 'not-found' }, 404);
    const result = await svc.createOrder({
      offer,
      buyerHandle: typeof body.buyerHandle === 'string' ? body.buyerHandle : '',
      quantity: Number(body.quantity ?? 1),
    });
    if (!result.ok) return json({ error: result.message ?? '创建失败。', code: result.code }, STATUS_BY_CODE[result.code] ?? 400);
    return json({ ok: true, order: result.data }, 201);
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  if (!orderId) return json({ error: 'orderId 不能为空。' }, 400);

  if (action === 'pay') {
    const result = await svc.startPayment(orderId);
    if (!result.ok) return json({ error: result.message ?? '支付失败。', code: result.code }, STATUS_BY_CODE[result.code] ?? 400);
    return json({ ok: true, paymentIntent: result.data });
  }
  if (action === 'fulfill') {
    const result = await svc.fulfill(orderId);
    if (!result.ok) return json({ error: result.message ?? '履约失败。', code: result.code }, STATUS_BY_CODE[result.code] ?? 400);
    return json({ ok: true, order: result.data });
  }
  if (action === 'refund') {
    const result = await svc.refund(orderId, typeof body.reason === 'string' ? body.reason : '');
    if (!result.ok) return json({ error: result.message ?? '退款失败。', code: result.code }, STATUS_BY_CODE[result.code] ?? 400);
    return json({ ok: true, order: result.data });
  }
  return json({ error: 'action 不合法（create/pay/fulfill/refund）。' }, 400);
};
