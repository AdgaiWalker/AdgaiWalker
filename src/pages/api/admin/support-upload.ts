/**
 * POST /api/admin/support-upload —— 赞赏码图片上传
 *
 * 页面内直接上传赞赏码 QR 图片(微信/支付宝),存到 public/uploads/support/,
 * 返回公开 URL 自动填入 SupportConfig 的 wechatQrUrl/alipayQrUrl。
 *
 * - 鉴权:admin(走 isAdminAsync)
 * - 审计:走 requireHighRiskAudit(action=support.media.upload,改变对外收款入口)
 * - 请求:multipart/form-data,field=wechat|alipay,file=图片二进制
 * - 降级:生产无 Redis → 审计 fail-closed → 503 storage-unavailable
 */
import type { APIRoute } from 'astro';

import { isAdminAsync } from '@/lib/admin-auth';
import { resolveAdminActor } from '@/lib/admin-actor';
import { requireHighRiskAudit } from '@/lib/admin-audit';
import { captureException } from '@/lib/sentry';
import { saveSupportMedia, removeSupportMedia, SupportMediaError } from '@/lib/support-media-storage';
import { createSessionStore } from '@/stores/session.store';
import { getSupportConfig, saveSupportConfig } from '@/stores/support-config.store';
import type { SupportConfig } from '@/stores/ports';

const sessionStore = createSessionStore();

export const prerender = false;

const VALID_FIELDS = new Set(['wechat', 'alipay']);
// multipart 解析大小上限:10MB(含 multipart 开销,实际图片受 SUPPORT_MEDIA_MAX_BYTES 5MB 限制)
const MAX_FORM_BYTES = 10 * 1024 * 1024;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return json({ error: '请用 multipart/form-data 上传文件。' }, 400);
  }

  // 审计前置:赞赏码改变对外收款入口,属高风险写
  const actor = await resolveAdminActor(request);
  const audit = await requireHighRiskAudit({
    actor,
    action: 'support.media.upload',
    targetType: 'support-config',
    targetId: 'global',
    reason: '赞赏码图片改变对外收款入口。',
  });
  if (!audit.ok) return json({ ok: false, reason: audit.reason, code: audit.code }, audit.status);

  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    captureException(error, { action: 'support.media.upload' });
    return json({ error: '表单解析失败。' }, 400);
  }

  const field = String(form.get('field') ?? '');
  if (!VALID_FIELDS.has(field)) {
    return json({ error: 'field 必须是 wechat 或 alipay。' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return json({ error: '请选择图片文件。' }, 400);
  }
  if (file.size > MAX_FORM_BYTES) {
    return json({ error: '文件过大。', code: 'too-large' }, 413);
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { publicUrl } = await saveSupportMedia(file.type, bytes);

    // 上传成功后,立即把 URL 写入 SupportConfig 对应字段
    const existing = await getSupportConfig();
    const config: SupportConfig = {
      ...existing,
      wechatQrUrl: field === 'wechat' ? publicUrl : existing?.wechatQrUrl,
      alipayQrUrl: field === 'alipay' ? publicUrl : existing?.alipayQrUrl,
      updatedAt: new Date().toISOString(),
    };
    await saveSupportConfig(config);

    return json({ ok: true, url: publicUrl, field });
  } catch (error) {
    if (error instanceof SupportMediaError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    captureException(error, { action: 'support.media.upload' });
    return json({ error: '上传失败,请重试。' }, 500);
  }
};

/**
 * DELETE /api/admin/support-upload —— 删除赞赏码
 *
 * 清空 SupportConfig 对应字段(wechat|alipay),并删除磁盘上的图片文件。
 * 外部图床 URL(非本站存的)只清配置,不删文件(删不到)。
 */
export const DELETE: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);

  let body: { field?: string };
  try { body = await request.json(); } catch { return json({ error: '请求格式错误。' }, 400); }

  const field = body.field;
  if (field !== 'wechat' && field !== 'alipay') {
    return json({ error: 'field 必须是 wechat 或 alipay。' }, 400);
  }

  // 审计前置(删除改变对外收款入口,与上传同级风险)
  const actor = await resolveAdminActor(request);
  const audit = await requireHighRiskAudit({
    actor,
    action: 'support.media.delete',
    targetType: 'support-config',
    targetId: 'global',
    reason: '删除赞赏码图片,改变对外收款入口。',
  });
  if (!audit.ok) return json({ ok: false, reason: audit.reason, code: audit.code }, audit.status);

  const existing = await getSupportConfig();
  const urlToRemove = field === 'wechat' ? existing?.wechatQrUrl : existing?.alipayQrUrl;

  // 1. 清空配置字段
  const config: SupportConfig = {
    ...existing,
    wechatQrUrl: field === 'wechat' ? undefined : existing?.wechatQrUrl,
    alipayQrUrl: field === 'alipay' ? undefined : existing?.alipayQrUrl,
    updatedAt: new Date().toISOString(),
  };
  await saveSupportConfig(config);

  // 2. 删存储文件(本站存的才删;外部图床 URL 跳过)
  if (urlToRemove) {
    const saved = inferSavedFromUrl(urlToRemove);
    if (saved) {
      try { await removeSupportMedia(saved); }
      catch (error) { captureException(error, { action: 'support.media.delete' }); /* 删文件失败不阻断配置清除 */ }
    }
  }

  return json({ ok: true, field });
};

/**
 * 从 publicUrl 反推存储信息,用于删除。
 * - Blob URL:形如 https://xxx.public.blob.vercel-storage.com/support/<uuid>.<ext>
 * - 本地 URL:形如 /uploads/support/<uuid>.<ext>
 * - 外部 URL:其他,返回 null(删不到)
 */
function inferSavedFromUrl(publicUrl: string): { publicUrl: string; storageBackend: 'local' | 'blob'; storageKey: string } | null {
  // Blob URL(含 vercel-storage.com 或 https 开头且不是本地路径)
  if (/^https?:\/\/.*vercel-storage\.com\//.test(publicUrl)) {
    const pathname = new URL(publicUrl).pathname.replace(/^\//, '');
    return { publicUrl, storageBackend: 'blob', storageKey: pathname };
  }
  // 本地 URL
  if (publicUrl.startsWith('/uploads/support/')) {
    const key = publicUrl.slice('/uploads/support/'.length);
    if (/^[a-f0-9-]+\.(png|jpe?g|webp|gif)$/i.test(key)) {
      return { publicUrl, storageBackend: 'local', storageKey: key };
    }
  }
  return null; // 外部图床,删不到
}
