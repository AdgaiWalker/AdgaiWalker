/**
 * /api/admin/support —— 赞赏/支持配置（个人收款码模型，P5）
 *
 * - GET  读取 SupportConfig（微信/支付宝赞赏码 QR URL + 外链 + 文案）
 * - PUT  更新（admin only）
 *
 * QR 图片：Walker 在 /admin/appearance 上传赞赏码图片后，把返回的 publicUrl 填入。
 * 不接触支付 SDK / 商户号 —— 个人收款码，访客扫码付。
 * Cache-Control: no-store（GET 也 no-store，避免拿到旧配置）。
 */
import type { APIRoute } from 'astro';

import { isAdminAsync } from '@/lib/admin-auth';
import { resolveAdminActor } from '@/lib/admin-actor';
import { requireHighRiskAudit } from '@/lib/admin-audit';
import { captureException } from '@/lib/sentry';
import { createSessionStore } from '@/stores/session.store';
import { getSupportConfig, saveSupportConfig } from '@/stores/support-config.store';
import type { SupportConfig } from '@/stores/ports';

const sessionStore = createSessionStore();

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export const GET: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);
  const config = await getSupportConfig();
  return json({ config: config ?? { updatedAt: '' } });
};

export const PUT: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch (error) { captureException(error, { action: 'support.config' }); return json({ error: '请求格式错误。' }, 400); }

  // 简单 URL 校验（只校验 http(s) 前缀，不抓取）
  const validateUrl = (v: string | undefined): string | undefined => {
    if (!v) return undefined;
    if (!/^https?:\/\//i.test(v)) return undefined; // 非法 URL 直接丢弃，不报错（容错）
    return v;
  };

  const config: SupportConfig = {
    wechatQrUrl: validateUrl(asString(body.wechatQrUrl)),
    alipayQrUrl: validateUrl(asString(body.alipayQrUrl)),
    externalUrl: validateUrl(asString(body.externalUrl)),
    externalLabel: asString(body.externalLabel),
    blurb: asString(body.blurb),
    updatedAt: new Date().toISOString(),
  };
  const actor = await resolveAdminActor(request);
  const audit = await requireHighRiskAudit({
    actor,
    action: 'support.config',
    targetType: 'support-config',
    targetId: 'global',
    reason: '赞赏码配置涉及收款二维码，改变对外收款入口。',
  });
  if (!audit.ok) return json({ ok: false, reason: audit.reason, code: audit.code }, audit.status);
  await saveSupportConfig(config);
  return json({ ok: true, config });
};
