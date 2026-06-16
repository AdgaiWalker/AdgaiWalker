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

  const ref = url.searchParams.get('ref');
  if (!ref) return jsonResponse({ error: '缺少 ref 参数。' }, 400);

  try {
    const file = await getContentStore().read(getPath(slug), { ref });
    return jsonResponse({ slug, content: file.content, sha: file.sha, name: file.name });
  } catch (error) {
    const status = error instanceof ContentStoreError ? error.status : 500;
    const message = error instanceof ContentStoreError ? error.message : '版本读取失败。';
    return jsonResponse({ error: message }, status);
  }
};
