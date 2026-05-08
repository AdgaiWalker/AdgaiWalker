import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export const prerender = true;

export async function GET(context: APIContext) {
  const logs = (await getCollection('log', ({ data }) => data.published))
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

  return rss({
    title: 'Walker — 航海日志',
    description: 'Walker 的个人航海日志，记录 AI 探索、独立开发与生活点滴。',
    site: context.site ?? 'https://iwalk.pro',
    items: logs.map((entry) => ({
      title: entry.data.title,
      description: entry.data.summary ?? entry.body?.slice(0, 160) ?? entry.data.title,
      pubDate: entry.data.date,
      link: `/log/${entry.id}/`,
    })),
  });
}
