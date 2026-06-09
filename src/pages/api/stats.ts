import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { Redis } from '@upstash/redis';
import { isPublicContentData } from '@/knowledge/content';
import { needCategoryLabels } from '@/profiles/resource-index';

export const GET: APIRoute = async () => {
  const url = import.meta.env.UPSTASH_REDIS_REST_URL ?? import.meta.env.KV_REST_API_URL;
  const token = import.meta.env.UPSTASH_REDIS_REST_TOKEN ?? import.meta.env.KV_REST_API_TOKEN;

  let matchCount = 0;
  const categoryCounts: Array<{ id: string; count: number }> = [];

  if (url && token) {
    const redis = new Redis({ url, token });
    const total = await redis.get<number>('match:stats:total');
    matchCount = total ?? 0;

    for (const [id] of Object.entries(needCategoryLabels)) {
      const count = await redis.get<number>(`match:stats:category:${id}`);
      if (count && count > 0) categoryCounts.push({ id, count });
    }
  }

  const content = await getCollection('log', ({ data }) => isPublicContentData(data));
  const contentCount = content.length;

  const topCategories = categoryCounts
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(c => ({
      id: c.id,
      label: needCategoryLabels[c.id as keyof typeof needCategoryLabels] ?? c.id,
      count: c.count,
    }));

  return new Response(JSON.stringify({ matchCount, contentCount, topCategories }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
