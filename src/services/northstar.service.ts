/**
 * NorthStar Service —— P5 经营订单/支付/退款编排（spec §14）
 *
 * 硬约束（spec §14）：NorthStar 默认 OFF。所有写操作在 isNorthStarEnabled() 为 false 时
 * 返回 northstar-disabled，不创建订单、不发起支付、不退款。关闭时个人闭环不受影响。
 *
 * 真实支付商（Stripe/支付宝）属 Human Gate：本服务通过 PaymentProviderPort 调用，
 * 开发期用 DevSyntheticPaymentProvider（不真实收费）；生产由 Walker 提供凭据后接入真实商。
 *
 * 状态机：created → paying → paid → fulfilled / refunded；created|paying → cancelled。
 * 非法迁移拒绝（invalid-transition）。每次迁移写 append-only history。
 */

import { randomUUID } from 'node:crypto';

import { getPaymentProvider } from '@/lib/payment-provider';
import { isNorthStarEnabled } from '@/lib/northstar-range';
import {
  findNorthStarOrder,
  findNorthStarPaymentIntent,
  saveNorthStarOrder,
  saveNorthStarPaymentIntent,
  saveNorthStarRefund,
} from '@/conversation/store';
import type { NorthStarOffer, Order, OrderStatus, PaymentIntent } from '@/stores/ports';

export type NorthStarResultCode =
  | 'ok'
  | 'northstar-disabled'
  | 'not-found'
  | 'invalid-input'
  | 'invalid-transition'
  | 'provider-error';

export interface NorthStarResult<T = void> {
  ok: boolean;
  code: NorthStarResultCode;
  message?: string;
  data?: T;
}

function nowIso(): string {
  return new Date().toISOString();
}

function fail<T = void>(code: NorthStarResultCode, message: string): NorthStarResult<T> {
  return { ok: false, code, message };
}
function ok<T>(data: T): NorthStarResult<T> {
  return { ok: true, code: 'ok', data };
}

const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  created: ['paying', 'cancelled'],
  paying: ['paid', 'cancelled', 'refunded'],
  paid: ['fulfilled', 'refunded'],
  fulfilled: ['refunded'],
  refunded: [],
  cancelled: [],
};

function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_ORDER_TRANSITIONS[from].includes(to);
}

function makeOrderId(): string {
  return `ns_order_${randomUUID()}`;
}

export class NorthStarService {
  /** 创建订单。NorthStar 关闭时拒绝。 */
  async createOrder(input: {
    offer: NorthStarOffer;
    buyerHandle: string;
    quantity: number;
  }): Promise<NorthStarResult<Order>> {
    if (!isNorthStarEnabled()) {
      return fail('northstar-disabled', 'NorthStar 经营范围未开启，不接受订单。');
    }
    if (!input.buyerHandle.trim()) return fail('invalid-input', '买家标识不能为空。');
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      return fail('invalid-input', '数量必须是正整数。');
    }
    if (input.offer.priceCents < 0) return fail('invalid-input', '标价非法。');

    const now = nowIso();
    const totalCents = input.offer.priceCents * input.quantity;
    const order: Order = {
      orderId: makeOrderId(),
      offerId: input.offer.offerId,
      buyerHandle: input.buyerHandle.trim(),
      quantity: input.quantity,
      totalCents,
      currency: input.offer.currency,
      status: 'created',
      createdAt: now,
      updatedAt: now,
      history: [{ fromStatus: null, toStatus: 'created', reason: '创建订单', occurredAt: now }],
    };
    await saveNorthStarOrder(order);
    return ok(order);
  }

  /** 发起支付：created → paying，调用 PaymentProviderPort 创建支付意图。 */
  async startPayment(orderId: string): Promise<NorthStarResult<PaymentIntent>> {
    if (!isNorthStarEnabled()) return fail('northstar-disabled', 'NorthStar 经营范围未开启。');
    const order = await findNorthStarOrder(orderId);
    if (!order) return fail('not-found', '订单不存在。');
    if (!canTransition(order.status, 'paying')) {
      return fail('invalid-transition', `订单状态 ${order.status} 不能发起支付。`);
    }
    const provider = getPaymentProvider();
    const intentResult = await provider.createIntent({
      orderId: order.orderId,
      amountCents: order.totalCents,
      currency: order.currency,
    });
    if (!intentResult.ok || !intentResult.paymentIntentId) {
      return fail('provider-error', intentResult.message ?? '支付提供商创建意图失败。');
    }
    const now = nowIso();
    const intent: PaymentIntent = {
      paymentIntentId: intentResult.paymentIntentId,
      orderId: order.orderId,
      amountCents: order.totalCents,
      currency: order.currency,
      // 合成 provider 即时成功；真实商需异步回调确认（此处保守标 pending，由 confirmPayment 推进）
      status: provider.providerId === 'dev-synthetic' ? 'succeeded' : 'pending',
      providerTransactionId: intentResult.providerTransactionId,
      provider: provider.providerId,
      createdAt: now,
      updatedAt: now,
    };
    await saveNorthStarPaymentIntent(intent);

    // created → paying（记录支付意图）；合成 provider 即时成功再 paying → paid
    const afterPaying = await this.transitionOrder(order, 'paying', `支付意图 ${intent.paymentIntentId}（${provider.providerId}）`);
    if (intent.status === 'succeeded') {
      await this.transitionOrder(afterPaying, 'paid', `合成支付即时成功 ${intent.paymentIntentId}`);
    }
    return ok(intent);
  }

  /** 真实商 webhook 回调确认支付成功：paying → paid。 */
  async confirmPayment(paymentIntentId: string): Promise<NorthStarResult<Order>> {
    if (!isNorthStarEnabled()) return fail('northstar-disabled', 'NorthStar 经营范围未开启。');
    const intent = await findNorthStarPaymentIntent(paymentIntentId);
    if (!intent) return fail('not-found', '支付意图不存在。');
    if (intent.status !== 'pending') return fail('invalid-transition', '支付意图非待确认状态。');
    const now = nowIso();
    await saveNorthStarPaymentIntent({ ...intent, status: 'succeeded', updatedAt: now });
    const order = await findNorthStarOrder(intent.orderId);
    if (!order) return fail('not-found', '订单不存在。');
    await this.transitionOrder(order, 'paid', `支付确认 ${paymentIntentId}`);
    return ok(await findNorthStarOrder(order.orderId) as Order);
  }

  /** 履约：paid → fulfilled。 */
  async fulfill(orderId: string): Promise<NorthStarResult<Order>> {
    return this.transitionById(orderId, 'fulfilled', '履约完成');
  }

  /** 退款：paid|paying|fulfilled → refunded，调用提供商退款。 */
  async refund(orderId: string, reason: string): Promise<NorthStarResult<Order>> {
    if (!isNorthStarEnabled()) return fail('northstar-disabled', 'NorthStar 经营范围未开启。');
    if (!reason.trim()) return fail('invalid-input', '退款必须填写理由。');
    const order = await findNorthStarOrder(orderId);
    if (!order) return fail('not-found', '订单不存在。');
    if (!canTransition(order.status, 'refunded')) {
      return fail('invalid-transition', `订单状态 ${order.status} 不能退款。`);
    }
    if (order.paymentIntentId) {
      const provider = getPaymentProvider();
      const r = await provider.refund({ paymentIntentId: order.paymentIntentId, amountCents: order.totalCents, reason });
      if (!r.ok) return fail('provider-error', r.message ?? '提供商退款失败。');
      await saveNorthStarRefund({
        refundId: r.refundId ?? `re_${randomUUID()}`,
        paymentIntentId: order.paymentIntentId,
        orderId: order.orderId,
        amountCents: order.totalCents,
        reason: reason.trim(),
        refundedAt: nowIso(),
      });
    }
    await this.transitionOrder(order, 'refunded', `退款：${reason}`);
    return ok(await findNorthStarOrder(order.orderId) as Order);
  }

  /** 取消：created|paying → cancelled。 */
  async cancel(orderId: string, reason: string): Promise<NorthStarResult<Order>> {
    if (!reason.trim()) return fail('invalid-input', '取消必须填写理由。');
    return this.transitionById(orderId, 'cancelled', `取消：${reason}`);
  }

  private async transitionById(orderId: string, to: OrderStatus, reason: string): Promise<NorthStarResult<Order>> {
    if (!isNorthStarEnabled()) return fail('northstar-disabled', 'NorthStar 经营范围未开启。');
    const order = await findNorthStarOrder(orderId);
    if (!order) return fail('not-found', '订单不存在。');
    if (!canTransition(order.status, to)) {
      return fail('invalid-transition', `订单状态 ${order.status} 不能迁移到 ${to}。`);
    }
    await this.transitionOrder(order, to, reason);
    return ok(await findNorthStarOrder(order.orderId) as Order);
  }

  private async transitionOrder(order: Order, to: OrderStatus, reason: string): Promise<Order> {
    const from = order.status;
    const now = nowIso();
    const updated: Order = {
      ...order,
      status: to,
      updatedAt: now,
      history: [...order.history, { fromStatus: from, toStatus: to, reason, occurredAt: now }],
    };
    await saveNorthStarOrder(updated);
    return updated;
  }
}

export function createNorthStarService(): NorthStarService {
  return new NorthStarService();
}
