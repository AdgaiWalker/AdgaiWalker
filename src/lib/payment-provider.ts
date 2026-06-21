/**
 * payment-provider.ts —— P5 支付提供商工厂（Port + 开发合成适配器）
 *
 * 与 MediaObjectStoragePort（文件dev/Blob生产）、AI Gateway（多服务商）同模式：
 * - 开发/测试：DevSyntheticPaymentProvider —— 记录支付意图、合成成功，**不真实扣款**。
 * - 生产：真实商（Stripe/支付宝等）由 Walker 提供凭据 + 合规决策后实现 PaymentProviderPort 并接入。
 *
 * 真实收费属 Human Gate：本文件永远不包含真实凭据，永远不发起真实扣款。
 */

import { randomUUID } from 'node:crypto';

import type { PaymentProviderPort } from '@/stores/ports';

/**
 * 开发合成支付提供商：返回合成成功的意图，不接触任何真实支付商、不扣款。
 * 用于本地开发与测试，验证订单/支付/退款状态机；生产必须替换为真实提供商。
 */
export class DevSyntheticPaymentProvider implements PaymentProviderPort {
  readonly providerId = 'dev-synthetic';

  async createIntent(input: { orderId: string; amountCents: number; currency: string }) {
    if (!input.orderId || input.amountCents <= 0) {
      return { ok: false, code: 'invalid-input' as const, message: '订单号与金额必须有效。' };
    }
    // 合成：永远成功，生成合成交易号（ct_ 前缀，便于审计区分真实 vs 合成）
    return {
      ok: true,
      paymentIntentId: `pi_dev_${randomUUID()}`,
      providerTransactionId: `ct_dev_${randomUUID()}`,
    };
  }

  async refund(input: { paymentIntentId: string; amountCents: number; reason: string }) {
    if (!input.paymentIntentId) {
      return { ok: false, code: 'not-found' as const, message: '缺少支付意图。' };
    }
    return { ok: true, refundId: `re_dev_${randomUUID()}` };
  }
}

let cachedProvider: PaymentProviderPort | null = null;

/**
 * 当前支付提供商。默认开发合成；生产由 Walker 配置真实商后注入（未来扩展点，当前不接真实商）。
 */
export function getPaymentProvider(): PaymentProviderPort {
  if (cachedProvider) return cachedProvider;
  // 真实支付商接入点（Human Gate）：Walker 选定 provider（Stripe/支付宝/微信）后，
  // 安装对应官方 SDK（如 `npm i stripe`），在此按配置返回真实适配器。例如：
  //
  //   const cfg = readPaymentConfig(); // 形如 ai-gateway-config 的 Redis hash
  //   if (cfg?.provider === 'stripe' && cfg.secretKey) {
  //     return new StripePaymentProvider(cfg.secretKey); // 用官方 SDK：import Stripe from 'stripe'
  //   }
  //
  // 当前 provider 未定 → 用合成（不真实收费），保证状态机可验证。
  cachedProvider = new DevSyntheticPaymentProvider();
  return cachedProvider;
}

/** 仅测试用：注入自定义 provider（如验证失败分支）。 */
export function __setPaymentProviderForTesting(provider: PaymentProviderPort | null): void {
  cachedProvider = provider;
}
