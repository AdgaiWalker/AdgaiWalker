import type { APIRoute } from 'astro';
import matter from 'gray-matter';
import { ContentStoreError } from '@/lib/admin-content-store';
import { isAdmin } from '@/lib/admin-auth';
import { requireHighRiskAudit } from '@/lib/admin-audit';
import { resolveAdminActor } from '@/lib/admin-actor';
import { getTopicCandidateById, updateTopicCandidateStatus } from '@/conversation/store';
import { resolveContentVisibility } from '@/knowledge/visibility';
import {
  jsonResponse,
  getContentStore,
  validateSlug,
  getPath,
  getContentId,
} from '@/lib/admin-content-helpers';

const MAX_CONTENT_BYTES = 100_000;
const VALID_VISIBILITIES = new Set(['public', 'draft', 'private']);

function storeErrorResponse(error: unknown, fallback: string): Response {
  if (error instanceof ContentStoreError) {
    return jsonResponse({ error: error.message || fallback }, error.status);
  }
  return jsonResponse({ error: fallback }, 500);
}

export const GET: APIRoute = async ({ params, request }) => {
  if (!isAdmin(request)) return jsonResponse({ error: '未授权。' }, 401);

  const slug = params.slug;
  if (!slug || !validateSlug(slug)) return jsonResponse({ error: '无效的 slug。' }, 400);

  const path = getPath(slug);
  try {
    const file = await getContentStore().read(path);
    return jsonResponse({ slug, content: file.content, sha: file.sha, name: file.name });
  } catch (error) {
    return storeErrorResponse(error, '文件不存在。');
  }
};

export const PUT: APIRoute = async ({ params, request }) => {
  if (!isAdmin(request)) return jsonResponse({ error: '未授权。' }, 401);

  const slug = params.slug;
  if (!slug || !validateSlug(slug)) return jsonResponse({ error: '无效的 slug。' }, 400);

  let body: { content?: string; sha?: string; message?: string; create?: boolean; topicId?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求格式错误。' }, 400);
  }

  if (typeof body.content !== 'string' || body.content.trim().length === 0) {
    return jsonResponse({ error: '内容不能为空。' }, 400);
  }
  if (body.content.length > MAX_CONTENT_BYTES) {
    return jsonResponse({ error: `内容太长，上限 ${MAX_CONTENT_BYTES / 1000}KB。` }, 413);
  }
  if (body.topicId !== undefined && typeof body.topicId !== 'string') {
    return jsonResponse({ error: 'topicId 必须是字符串。' }, 400);
  }

  const parsedContent = matter(body.content);
  const sourceTopicId = (body.topicId || parsedContent.data.sourceTopicId || '').toString().trim();
  if (sourceTopicId && !await getTopicCandidateById(sourceTopicId)) {
    return jsonResponse({ error: '选题簇不存在。' }, 404);
  }

  const path = getPath(slug);
  const store = getContentStore();
  const exists = await store.exists(path);

  if (body.create && exists) {
    return jsonResponse({ error: 'slug 已存在，不能覆盖已有内容。' }, 409);
  }

  let sha = body.sha;
  if (!body.create && !sha) {
    if (!exists) return jsonResponse({ error: '文件不存在，请使用新建模式。' }, 404);
    sha = (await store.read(path)).sha;
  }

  try {
    const result = await store.write({
      path,
      content: body.content,
      sha,
      message: body.message || (body.create ? `content: create ${slug}` : `content: update ${slug}`),
    });
    if (sourceTopicId) {
      const status = resolveContentVisibility(parsedContent.data) === 'public' ? 'produced' : 'accepted';
      await updateTopicCandidateStatus(sourceTopicId, status, {
        producedContentSlug: getContentId(slug),
      });
    }
    return jsonResponse({
      ok: true,
      slug,
      sha: result.sha,
      topicLinked: Boolean(sourceTopicId),
      message: body.create ? '已创建，约 60s 后自动部署。' : '已提交，约 60s 后自动部署。',
    });
  } catch (error) {
    return storeErrorResponse(error, '保存失败。');
  }
};

export const PATCH: APIRoute = async ({ params, request }) => {
  if (!isAdmin(request)) return jsonResponse({ error: '未授权。' }, 401);

  const slug = params.slug;
  if (!slug || !validateSlug(slug)) return jsonResponse({ error: '无效的 slug。' }, 400);

  let body: { visibility?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求格式错误。' }, 400);
  }

  const visibility = body.visibility;
  if (typeof visibility !== 'string' || !VALID_VISIBILITIES.has(visibility)) {
    return jsonResponse({ error: '无效的可见性。' }, 400);
  }

  const path = getPath(slug);
  const store = getContentStore();
  try {
    const file = await store.read(path);
    const parsed = matter(file.content);
    const nextContent = matter.stringify(parsed.content, {
      ...parsed.data,
      visibility,
      published: visibility === 'public',
    });
    const result = await store.write({
      path,
      message: `content: set ${slug} ${visibility}`,
      content: nextContent,
      sha: file.sha,
    });
    if (visibility === 'public' && typeof parsed.data.sourceTopicId === 'string') {
      await updateTopicCandidateStatus(parsed.data.sourceTopicId, 'produced', {
        producedContentSlug: getContentId(slug),
      });
    }
    return jsonResponse({ ok: true, slug, visibility, sha: result.sha });
  } catch (error) {
    return storeErrorResponse(error, '保存失败。');
  }
};

export const DELETE: APIRoute = async ({ params, request }) => {
  if (!isAdmin(request)) return jsonResponse({ error: '未授权。' }, 401);

  const slug = params.slug;
  if (!slug || !validateSlug(slug)) return jsonResponse({ error: '无效的 slug。' }, 400);

  const path = getPath(slug);
  const store = getContentStore();
  try {
    const file = await store.read(path);
    const actor = await resolveAdminActor(request);
    const audit = await requireHighRiskAudit({
      actor,
      action: 'content.delete',
      targetType: 'content',
      targetId: slug,
      reason: '删除内容文件会移除公开或草稿内容，需要审计成功后执行。',
      detail: { path },
    });
    if (!audit.ok) return jsonResponse({ error: audit.reason, code: audit.code }, audit.status);
    await store.delete(path, file.sha, `content: delete ${slug}`);
    return jsonResponse({ ok: true, slug });
  } catch (error) {
    return storeErrorResponse(error, '删除失败。');
  }
};
