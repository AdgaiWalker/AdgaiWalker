import type { APIRoute } from 'astro';
import { isAdmin } from '@/lib/admin-auth';
import {
  jsonResponse,
  getContentStore,
  validateSlug,
  getPath,
} from '@/lib/admin-content-helpers';
import { ContentStoreError } from '@/lib/admin-content-store';

export const GET: APIRoute = async ({ params, request, url }) => {
  if (!isAdmin(request)) return jsonResponse({ error: '未授权。' }, 401);

  const slug = params.slug;
  if (!slug || !validateSlug(slug)) return jsonResponse({ error: '无效的 slug。' }, 400);

  const perPage = Math.min(Math.max(Number(url.searchParams.get('perPage')) || 30, 1), 100);
  try {
    const commits = await getContentStore().listHistory(getPath(slug), { perPage });
    return jsonResponse({ slug, commits });
  } catch (error) {
    const status = error instanceof ContentStoreError ? error.status : 500;
    const message = error instanceof ContentStoreError ? error.message : '历史读取失败。';
    return jsonResponse({ error: message }, status);
  }
};
