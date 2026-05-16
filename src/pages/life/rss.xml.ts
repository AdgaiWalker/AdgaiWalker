import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const lifeLogs = await getCollection('log', ({ data }) => data.published && data.category === 'life');
  
  return rss({
    title: 'Walker — 生活日志',
    description: '生活点滴、读书分享与日常随想。',
    site: context.site?.toString() || 'https://iwalk.pro',
    items: lifeLogs.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.summary || post.data.description || '阅读完整内容...',
      link: `/posts/${post.id}/`,
    })),
    customData: `<language>zh-cn</language>`,
  });
}
