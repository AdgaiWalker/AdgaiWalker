import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const aiLogs = await getCollection('log', ({ data }) => data.published && data.category === 'ai');
  
  return rss({
    title: 'Walker — AI 探索',
    description: '关于 AI、效率工具与哲学思考的文章记录。',
    site: context.site?.toString() || 'https://iwalk.pro',
    items: aiLogs.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.summary || post.data.description || '阅读完整内容...',
      link: `/ai/${post.id}/`,
    })),
    customData: `<language>zh-cn</language>`,
  });
}
