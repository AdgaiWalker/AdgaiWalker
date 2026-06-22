/**
 * NorthStar Store — 实现 NorthStarOrderRepositoryPort
 *
 * NorthStar 订单 / 支付意图 / 退款 / Offer 存储的真正实现（Redis + 内存降级）。
 * NorthStar 存储逻辑从 conversation/store.ts 迁移至此，成为 NorthStar 域的权威存储入口。
 *
 * Key 约定：
 *   northstar:order:{orderId}            单个订单
 *   northstar:payment-intent:{piId}      单个支付意图
 *   northstar:refund:{refundId}          单个退款
 *   northstar:offer:{offerId}            单个 Offer
 *   northstar:orders:recent               最近订单索引（LPUSH + LTRIM）
 *   northstar:offers:recent               最近 Offer 索引（LPUSH + LTRIM）
 * 注意：NorthStar 默认 OFF；这些键只在 isNorthStarEnabled() 时由 service 写入。
 */
import { getRedis } from '@/stores/redis-client';

import type {
  Order,
  PaymentIntent,
  RefundRecord,
  NorthStarOffer,
  NorthStarOrderRepositoryPort,
} from './ports';

// ---------------------------------------------------------------------------
// 内存降级存储
// ---------------------------------------------------------------------------

const memoryNorthStarOrders = new Map<string, Order>();
const memoryNorthStarPaymentIntents = new Map<string, PaymentIntent>();
const memoryNorthStarRefunds = new Map<string, RefundRecord>();
const memoryNorthStarOffers = new Map<string, NorthStarOffer>();

// ---------------------------------------------------------------------------
// Redis key 约定
// ---------------------------------------------------------------------------

function northstarOrderKey(orderId: string): string {
  return `northstar:order:${orderId}`;
}
function northstarPaymentIntentKey(piId: string): string {
  return `northstar:payment-intent:${piId}`;
}
function northstarRefundKey(refundId: string): string {
  return `northstar:refund:${refundId}`;
}
const NORTHSTAR_ORDERS_RECENT = 'northstar:orders:recent';

function northstarOfferKey(offerId: string): string {
  return `northstar:offer:${offerId}`;
}
const NORTHSTAR_OFFERS_RECENT = 'northstar:offers:recent';

/** 仅测试用：清空内存 NorthStar 订单/支付/退款/Offer。 */
export function __resetMemoryNorthStar(): void {
  memoryNorthStarOrders.clear();
  memoryNorthStarPaymentIntents.clear();
  memoryNorthStarRefunds.clear();
  memoryNorthStarOffers.clear();
}

// ---------------------------------------------------------------------------
// Offer CRUD
// ---------------------------------------------------------------------------

export async function saveNorthStarOffer(offer: NorthStarOffer): Promise<void> {
  memoryNorthStarOffers.set(offer.offerId, offer);
  const redis = getRedis();
  if (!redis) return;
  const tx = redis.multi();
  tx.set(northstarOfferKey(offer.offerId), offer);
  tx.lpush(NORTHSTAR_OFFERS_RECENT, offer.offerId);
  tx.ltrim(NORTHSTAR_OFFERS_RECENT, 0, 199);
  await tx.exec();
}

export async function findNorthStarOffer(offerId: string): Promise<NorthStarOffer | null> {
  const redis = getRedis();
  const fromMemory = memoryNorthStarOffers.get(offerId) ?? null;
  if (!redis) return fromMemory;
  try {
    return (await redis.get<NorthStarOffer>(northstarOfferKey(offerId))) ?? fromMemory;
  } catch { return fromMemory; }
}

export async function findAllNorthStarOffers(limit = 200): Promise<NorthStarOffer[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memoryNorthStarOffers.values()]
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, limit);
  }
  const ids = await redis.lrange<string>(NORTHSTAR_OFFERS_RECENT, 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis!.get<NorthStarOffer>(northstarOfferKey(id))));
  return items.filter((o): o is NorthStarOffer => o !== null)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// ---------------------------------------------------------------------------
// 订单 / 支付意图 / 退款 CRUD
// ---------------------------------------------------------------------------

export async function findRecentNorthStarOrders(limit = 100): Promise<Order[]> {
  const redis = getRedis();
  if (!redis) {
    return [...memoryNorthStarOrders.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }
  const ids = await redis.lrange<string>(NORTHSTAR_ORDERS_RECENT, 0, Math.max(0, limit - 1));
  const items = await Promise.all(ids.map(id => redis!.get<Order>(northstarOrderKey(id))));
  return items.filter((o): o is Order => o !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveNorthStarOrder(order: Order): Promise<void> {
  memoryNorthStarOrders.set(order.orderId, order);
  const redis = getRedis();
  if (!redis) return;
  const tx = redis.multi();
  tx.set(northstarOrderKey(order.orderId), order);
  tx.lpush(NORTHSTAR_ORDERS_RECENT, order.orderId);
  tx.ltrim(NORTHSTAR_ORDERS_RECENT, 0, 499);
  await tx.exec();
}

export async function findNorthStarOrder(orderId: string): Promise<Order | null> {
  const redis = getRedis();
  const fromMemory = memoryNorthStarOrders.get(orderId) ?? null;
  if (!redis) return fromMemory;
  try {
    return (await redis.get<Order>(northstarOrderKey(orderId))) ?? fromMemory;
  } catch {
    return fromMemory;
  }
}

export async function saveNorthStarPaymentIntent(intent: PaymentIntent): Promise<void> {
  memoryNorthStarPaymentIntents.set(intent.paymentIntentId, intent);
  const redis = getRedis();
  if (!redis) return;
  await redis.set(northstarPaymentIntentKey(intent.paymentIntentId), intent);
}

export async function findNorthStarPaymentIntent(piId: string): Promise<PaymentIntent | null> {
  const redis = getRedis();
  const fromMemory = memoryNorthStarPaymentIntents.get(piId) ?? null;
  if (!redis) return fromMemory;
  try {
    return (await redis.get<PaymentIntent>(northstarPaymentIntentKey(piId))) ?? fromMemory;
  } catch {
    return fromMemory;
  }
}

export async function saveNorthStarRefund(refund: RefundRecord): Promise<void> {
  memoryNorthStarRefunds.set(refund.refundId, refund);
  const redis = getRedis();
  if (!redis) return;
  await redis.set(northstarRefundKey(refund.refundId), refund);
}

// ---------------------------------------------------------------------------
// Port 工厂 —— 上层依赖 NorthStarOrderRepositoryPort 接口，不依赖具体函数
// ---------------------------------------------------------------------------

export function createNorthStarOrderStore(): NorthStarOrderRepositoryPort {
  return {
    async saveOrder(order: Order): Promise<void> {
      await saveNorthStarOrder(order);
    },

    async findOrder(orderId: string): Promise<Order | null> {
      return findNorthStarOrder(orderId);
    },

    async savePaymentIntent(intent: PaymentIntent): Promise<void> {
      await saveNorthStarPaymentIntent(intent);
    },

    async findPaymentIntent(paymentIntentId: string): Promise<PaymentIntent | null> {
      return findNorthStarPaymentIntent(paymentIntentId);
    },

    async saveRefund(refund: RefundRecord): Promise<void> {
      await saveNorthStarRefund(refund);
    },
  };
}
