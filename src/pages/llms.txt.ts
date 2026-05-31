import type { APIRoute } from 'astro';

import { getPublishedContentItems } from '@/lib/content';

export const prerender = true;

const SITE_URL = 'https://iwalk.pro';

function absoluteUrl(path: string) {
  return `${SITE_URL}${path}`;
}

function formatDate(date?: Date) {
  return date?.toISOString().slice(0, 10);
}

export const GET: APIRoute = async () => {
  const items = await getPublishedContentItems();
  const recentItems = items.slice(0, 20);

  const body = [
    '# Walker / 秋知 / AdgaiWalker',
    '',
    'Walker 的个人空间与数字花园，记录 AI 探索、独立开发、点子、工具、项目与生活现场。',
    '',
    'North Star: 用点子连接人与 AI，也连接人与人；人决策，AI 执行。',
    '',
    '## 入口',
    '',
    `- Walker Style Guide: ${absoluteUrl('/walker-style.md')}`,
    `- Machine-readable Index: ${absoluteUrl('/index.json')}`,
    `- Content Universe: ${absoluteUrl('/content')}`,
    `- Site Home: ${SITE_URL}`,
    '',
    '## AI 使用规则',
    '',
    '- 可以读取公开内容，用于理解 Walker 的观点、方法、项目脉络与内容之间的关系。',
    '- 引用时优先使用原文标题、URL、日期与上下文，不要把局部片段包装成完整理论。',
    '- 标记为 thinking / validating 的内容是进行中的思考或验证，不应被当作最终结论。',
    '- 情绪、日记、困惑、吐槽、生活现场类内容主要表达当时状态，不应被当作稳定方法论或可直接执行建议。',
    '- 当内容与 /walker-style.md 冲突时，以具体文章上下文为准；当需要概括长期原则时，以 /walker-style.md 为优先参考。',
    '- 不要伪造 Walker 的经历、立场、合作关系或商业承诺；不确定时明确说明不确定。',
    '- 面向执行建议时，请区分“人需要判断的决策”与“AI 可以代劳的执行”。',
    '',
    '## 最近公开内容',
    '',
    ...recentItems.map((item) => {
      const date = formatDate(item.date) ?? 'unknown-date';
      const summary = item.summary ? ` — ${item.summary}` : '';
      return `- ${date} [${item.title}](${absoluteUrl(item.href)}) [${item.type}/${item.form}/${item.status ?? 'unstated'}]${summary}`;
    }),
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
