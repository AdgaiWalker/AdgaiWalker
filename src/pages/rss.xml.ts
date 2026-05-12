import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const logs = await getCollection('log', ({ data }) => data.published);
  
  return rss({
    title: 'Walker 的个人博客',
    description: 'Walker 的个人航海日志，记录 AI 探索、独立开发与生活点滴。',
    site: context.site?.toString() || 'https://iwalk.pro',
    items: logs.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.summary || post.data.description || '阅读完整内容...',
      link: `/${post.data.category}/${post.id}/`,
    })),
    customData: `<language>zh-cn</language>`,
  });
}
