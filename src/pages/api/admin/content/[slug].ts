import type { APIRoute } from 'astro';
import matter from 'gray-matter';
import {
  ContentStoreError,
  createGitHubContentFileStore,
  createLocalContentFileStore,
  type ContentFileStore,
} from '@/lib/admin-content-store';
import { isAdmin } from '@/lib/admin-auth';

const GITHUB_OWNER = 'AdgaiWalker';
const GITHUB_REPO = 'AdgaiWalker';
const CONTENT_PATH_PREFIX = 'src/content/log/';
const MAX_CONTENT_BYTES = 100_000;
const VALID_VISIBILITIES = new Set(['public', 'draft', 'private']);

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function getToken(): string | null {
  return import.meta.env.GITHUB_TOKEN || null;
}

function getContentStore(): ContentFileStore {
  const token = getToken();
  if (import.meta.env.DEV && !token) {
    return createLocalContentFileStore();
  }

  return createGitHubContentFileStore({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    token,
  });
}

function validateSlug(slug: string): boolean {
  return /^[\p{Script=Han}\w\s.-]+$/u.test(slug)
    && !slug.includes('..')
    && !slug.includes('/')
    && !slug.includes('\\');
}

function getPath(slug: string): string {
  const hasKnownExt = slug.endsWith('.md') || slug.endsWith('.mdx');
  return `${CONTENT_PATH_PREFIX}${hasKnownExt ? slug : `${slug}.md`}`;
}

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

  let body: { content?: string; sha?: string; message?: string; create?: boolean };
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
    return jsonResponse({
      ok: true,
      slug,
      sha: result.sha,
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
    await store.delete(path, file.sha, `content: delete ${slug}`);
    return jsonResponse({ ok: true, slug });
  } catch (error) {
    return storeErrorResponse(error, '删除失败。');
  }
};
