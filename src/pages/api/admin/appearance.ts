/**
 * /api/admin/appearance —— 后台外观与媒体个人化（UX1）
 */
import type { APIRoute } from 'astro';

import { isAdminAsync } from '@/lib/admin-auth';
import { resolveAdminActor } from '@/lib/admin-actor';
import { requireHighRiskAudit } from '@/lib/admin-audit';
import { captureException } from '@/lib/sentry';
import { createSessionStore } from '@/stores/session.store';
import { createAppearanceService } from '@/services/appearance.service';

const sessionStore = createSessionStore();

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const CODE_STATUS: Record<string, number> = {
  ok: 200,
  'invalid-input': 400,
  'unsupported-media': 415,
  'too-large': 413,
  'not-found': 404,
  'storage-unavailable': 503,
};

export const GET: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);
  const owner = await resolveAdminActor(request);
  const state = await createAppearanceService().getState(owner);
  return json({ ok: true, ...state });
};

export const PATCH: APIRoute = async ({ request }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);
  const owner = await resolveAdminActor(request);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch (error) { captureException(error, { action: 'appearance.patch' }); return json({ error: '请求格式错误。' }, 400); }
  const result = await createAppearanceService().saveTheme(owner, {
    name: typeof body.name === 'string' ? body.name : undefined,
    accent: body.accent === 'walker-jade' || body.accent === 'aurora' || body.accent === 'sunset' || body.accent === 'mint' ? body.accent : undefined,
    density: body.density === 'low' || body.density === 'comfortable' ? body.density : undefined,
    backgroundAssetId: typeof body.backgroundAssetId === 'string' ? body.backgroundAssetId : undefined,
    readabilityOverlay: typeof body.readabilityOverlay === 'number' ? body.readabilityOverlay : undefined,
    reducedMotion: body.reducedMotion === true,
  });
  if (!result.ok) return json({ error: result.message, code: result.code }, CODE_STATUS[result.code] ?? 400);
  return json({ ok: true, theme: result.data });
};

export const POST: APIRoute = async ({ request, url }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);
  const owner = await resolveAdminActor(request);
  const action = url.searchParams.get('action');
  const service = createAppearanceService();
  if (action === 'reset') {
    const result = await service.resetTheme(owner);
    if (!result.ok) return json({ error: result.message, code: result.code }, CODE_STATUS[result.code] ?? 400);
    return json({ ok: true, theme: result.data });
  }
  let form: FormData;
  try { form = await request.formData(); } catch (error) { captureException(error, { action: 'appearance.media-upload' }); return json({ error: '请使用 multipart/form-data 上传媒体文件。' }, 400); }
  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: '请选择要上传的媒体文件。' }, 400);
  const result = await service.addMedia(owner, {
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    bytes: await file.arrayBuffer(),
  });
  if (!result.ok) return json({ error: result.message, code: result.code }, CODE_STATUS[result.code] ?? 400);
  return json({ ok: true, media: result.data }, 201);
};

export const DELETE: APIRoute = async ({ request, url }) => {
  if (!await isAdminAsync(request, sessionStore)) return json({ error: '未授权。' }, 401);
  const owner = await resolveAdminActor(request);
  const assetId = url.searchParams.get('assetId');
  if (!assetId) return json({ error: 'assetId 不能为空。' }, 400);
  const audit = await requireHighRiskAudit({
    actor: owner,
    action: 'media.delete',
    targetType: 'media-asset',
    targetId: assetId,
    reason: '删除媒体资产不可逆。',
  });
  if (!audit.ok) return json({ ok: false, reason: audit.reason, code: audit.code }, audit.status);
  const result = await createAppearanceService().removeMedia(owner, assetId);
  if (!result.ok) return json({ error: result.message, code: result.code }, CODE_STATUS[result.code] ?? 400);
  return json({ ok: true });
};
