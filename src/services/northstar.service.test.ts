import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetMemoryNorthStar } from '@/conversation/store';
import { createNorthStarService } from './northstar.service';
import type { NorthStarOffer } from '@/stores/ports';

const OFFER: NorthStarOffer = {
  offerId: 'offer-1',
  kind: 'service',
  title: '一次咨询',
  description: '30 分钟',
  priceCents: 9900,
  currency: 'CNY',
  publishedBy: 'walker',
  publishedAt: '2026-06-21T00:00:00.000Z',
  status: 'active',
};

describe('NorthStarService P5 订单/支付/退款（默认 OFF + 合成支付）', () => {
  beforeEach(() => {
    __resetMemoryNorthStar();
    vi.stubEnv('NORTHSTAR_ENABLED', 'true');
  });
  afterEach(() => {
    __resetMemoryNorthStar();
    vi.unstubAllEnvs();
  });

  it('完整正向链路：created → paying → paid（合成即时成功）→ fulfilled', async () => {
    const svc = createNorthStarService();
    const created = await svc.createOrder({ offer: OFFER, buyerHandle: 'alice@example', quantity: 1 });
    expect(created.ok).toBe(true);
    expect(created.data?.status).toBe('created');
    const orderId = created.data!.orderId;

    const intent = await svc.startPayment(orderId);
    expect(intent.ok).toBe(true);
    expect(intent.data?.provider).toBe('dev-synthetic');

    // 合成即时成功：订单已到 paid
    const fulfilled = await svc.fulfill(orderId);
    expect(fulfilled.ok).toBe(true);
    expect(fulfilled.data?.status).toBe('fulfilled');
  });

  it('状态机非法迁移被拒（fulfilled 后不能再 fulfill）', async () => {
    const svc = createNorthStarService();
    const c = await svc.createOrder({ offer: OFFER, buyerHandle: 'bob', quantity: 2 });
    await svc.startPayment(c.data!.orderId); // → paid（合成）
    const fulfilled = await svc.fulfill(c.data!.orderId);
    expect(fulfilled.ok).toBe(true);
    expect(fulfilled.data?.status).toBe('fulfilled');

    const again = await svc.fulfill(c.data!.orderId);
    expect(again.ok).toBe(false);
    expect(again.code).toBe('invalid-transition');
  });

  it('退款链路：paid → refunded，写退款记录', async () => {
    const svc = createNorthStarService();
    const c = await svc.createOrder({ offer: OFFER, buyerHandle: 'carol', quantity: 1 });
    await svc.startPayment(c.data!.orderId); // → paid
    const refunded = await svc.refund(c.data!.orderId, '买家取消');
    expect(refunded.ok).toBe(true);
    expect(refunded.data?.status).toBe('refunded');
    // refunded 是终态，不能再迁移
    const afterRefund = await svc.cancel(c.data!.orderId, 'x');
    expect(afterRefund.code).toBe('invalid-transition');
  });

  it('取消：created → cancelled', async () => {
    const svc = createNorthStarService();
    const c = await svc.createOrder({ offer: OFFER, buyerHandle: 'dan', quantity: 1 });
    const cancelled = await svc.cancel(c.data!.orderId, '不想要了');
    expect(cancelled.ok).toBe(true);
    expect(cancelled.data?.status).toBe('cancelled');
  });

  it('每次状态迁移写 append-only history', async () => {
    const svc = createNorthStarService();
    const c = await svc.createOrder({ offer: OFFER, buyerHandle: 'eve', quantity: 1 });
    await svc.startPayment(c.data!.orderId); // created → (paying →) paid
    const order = (await svc.refund(c.data!.orderId, 'r'))!.data!;
    // history 至少：created + paying + paid + refunded
    expect(order.history.length).toBeGreaterThanOrEqual(3);
    expect(order.history.map(h => h.toStatus)).toEqual(expect.arrayContaining(['created', 'paid', 'refunded']));
  });

  it('非法输入：空买家 / 非正数量 / 负标价', async () => {
    const svc = createNorthStarService();
    expect((await svc.createOrder({ offer: OFFER, buyerHandle: '', quantity: 1 })).code).toBe('invalid-input');
    expect((await svc.createOrder({ offer: OFFER, buyerHandle: 'x', quantity: 0 })).code).toBe('invalid-input');
    expect((await svc.createOrder({
      offer: { ...OFFER, priceCents: -1 }, buyerHandle: 'x', quantity: 1,
    })).code).toBe('invalid-input');
  });

  it('订单不存在 → not-found', async () => {
    const svc = createNorthStarService();
    expect((await svc.fulfill('missing')).code).toBe('not-found');
    expect((await svc.refund('missing', 'r')).code).toBe('not-found');
  });
});

describe('NorthStarService NorthStar-OFF 硬守护', () => {
  beforeEach(() => {
    __resetMemoryNorthStar();
    vi.stubEnv('NORTHSTAR_ENABLED', 'false'); // 默认关闭
  });
  afterEach(() => {
    __resetMemoryNorthStar();
    vi.unstubAllEnvs();
  });

  it('NorthStar 关闭时所有写操作返回 northstar-disabled（个人闭环不受影响）', async () => {
    const svc = createNorthStarService();
    const created = await svc.createOrder({ offer: OFFER, buyerHandle: 'x', quantity: 1 });
    expect(created.ok).toBe(false);
    expect(created.code).toBe('northstar-disabled');

    // 关闭时 startPayment/fulfill/refund 也都拒绝（即便传不存在的 id 也先判 OFF）
    expect((await svc.startPayment('any')).code).toBe('northstar-disabled');
    expect((await svc.fulfill('any')).code).toBe('northstar-disabled');
    expect((await svc.refund('any', 'r')).code).toBe('northstar-disabled');
  });
});
