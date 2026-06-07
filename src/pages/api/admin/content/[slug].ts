import type { APIRoute } from 'astro';
import { isAdmin } from '@/lib/admin-auth';

const GITHUB_OWNER = 'AdgaiWalker';
const GITHUB_REPO = 'AdgaiWalker';
const CONTENT_PATH_PREFIX = 'src/content/log/';
const ALLOWED_EXTENSIONS = ['.md', '.mdx'];
const GITHUB_API = 'https://api.github.com';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function getToken(): string | null {
  return import.meta.env.GITHUB_TOKEN || null;
}

function validateSlug(slug: string): boolean {
  // 只允许中文、字母、数字、连字符、空格、点
  return /^[\w一-鿿\s\-\.]+$/.test(slug) && !slug.includes('..');
}

function getPath(slug: string): string {
  const ext = slug.endsWith('.mdx') ? '' : '.md';
  return `${CONTENT_PATH_PREFIX}${slug}${ext}`;
}

async function githubApi(path: string, options: RequestInit): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Walker-Admin',
    ...options.headers as Record<string, string>,
  };
  return fetch(`${GITHUB_API}${path}`, { ...options, headers });
}

/** GET /api/admin/content/[slug] — 读取 markdown 源文件 */
export const GET: APIRoute = async ({ params, request }) => {
  if (!isAdmin(request)) return jsonResponse({ error: '未授权。' }, 401);

  const slug = params.slug;
  if (!slug || !validateSlug(slug)) return jsonResponse({ error: '无效的 slug。' }, 400);

  const path = getPath(slug);
  const res = await githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(path)}`, { method: 'GET' });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return jsonResponse({ error: err.message || '文件不存在。' }, res.status);
  }

  const data = await res.json() as { content: string; sha: string; name: string };
  const content = Buffer.from(data.content, 'base64').toString('utf-8');

  return jsonResponse({ slug, content, sha: data.sha, name: data.name });
};

/** PUT /api/admin/content/[slug] — 更新内容 */
export const PUT: APIRoute = async ({ params, request }) => {
  if (!isAdmin(request)) return jsonResponse({ error: '未授权。' }, 401);

  const slug = params.slug;
  if (!slug || !validateSlug(slug)) return jsonResponse({ error: '无效的 slug。' }, 400);

  let body: { content?: string; sha?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求格式错误。' }, 400);
  }

  if (typeof body.content !== 'string' || body.content.length === 0) {
    return jsonResponse({ error: '内容不能为空。' }, 400);
  }
  if (body.content.length > 100_000) {
    return jsonResponse({ error: '内容太长（上限 100KB）。' }, 413);
  }

  const path = getPath(slug);
  const message = body.message || `content: update ${slug}`;

  // 如果没提供 SHA，先获取最新
  let sha = body.sha;
  if (!sha) {
    const getRes = await githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(path)}`, { method: 'GET' });
    if (!getRes.ok) return jsonResponse({ error: '文件不存在，请先创建。' }, 404);
    const getData = await getRes.json() as { sha: string };
    sha = getData.sha;
  }

  const res = await githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: Buffer.from(body.content).toString('base64'),
      sha,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return jsonResponse({ error: err.message || '更新失败。' }, res.status);
  }

  return jsonResponse({ ok: true, slug, message: '已提交，约 60s 后自动部署。' });
};

/** DELETE /api/admin/content/[slug] — 删除内容 */
export const DELETE: APIRoute = async ({ params, request }) => {
  if (!isAdmin(request)) return jsonResponse({ error: '未授权。' }, 401);

  const slug = params.slug;
  if (!slug || !validateSlug(slug)) return jsonResponse({ error: '无效的 slug。' }, 400);

  const path = getPath(slug);

  // 先获取 SHA
  const getRes = await githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(path)}`, { method: 'GET' });
  if (!getRes.ok) return jsonResponse({ error: '文件不存在。' }, 404);
  const getData = await getRes.json() as { sha: string };

  const res = await githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(path)}`, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `content: delete ${slug}`,
      sha: getData.sha,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return jsonResponse({ error: err.message || '删除失败。' }, res.status);
  }

  return jsonResponse({ ok: true, slug });
};
