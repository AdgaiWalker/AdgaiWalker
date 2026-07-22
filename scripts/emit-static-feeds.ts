/**
 * emit-static-feeds — 从 content.json 生成 rss.xml 与 llms.txt 到 web dist
 * 依赖：paths、fs
 * 触发：build-web（prerender 之后）
 */
import fs from 'node:fs';
import path from 'node:path';
import { contentJsonPath, webDistDir } from './lib/paths';

const SITE = 'https://www.iwalk.pro';

type Item = {
  slug: string;
  title: string;
  date: string;
  summary?: string;
  type?: string;
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

if (!fs.existsSync(contentJsonPath)) {
  console.error('content.json missing; run content:gen first');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(contentJsonPath, 'utf8')) as {
  items?: Item[];
};
const items = raw.items ?? [];

fs.mkdirSync(webDistDir, { recursive: true });

const rssItems = items
  .slice(0, 40)
  .map((i) => {
    const link = `${SITE}/posts/${encodeURIComponent(i.slug)}`;
    return `    <item>
      <title>${escapeXml(i.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(i.date || Date.now()).toUTCString()}</pubDate>
      <description>${escapeXml(i.summary || '')}</description>
    </item>`;
  })
  .join('\n');

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Walker · iwalk.pro</title>
    <link>${SITE}/</link>
    <description>行过万里水路 — 公开笔记</description>
    <language>zh-CN</language>
${rssItems}
  </channel>
</rss>
`;

fs.writeFileSync(path.join(webDistDir, 'rss.xml'), rss, 'utf8');

const llms = [
  '# Walker (iwalk.pro)',
  '',
  '> 个人笔记与双入口（卡 / 逛）。内容源 Markdown。',
  '',
  '## 主要路径',
  '',
  `- 首页: ${SITE}/`,
  `- 逛(文章): ${SITE}/posts`,
  `- 卡(intake): ${SITE}/tools`,
  `- RSS: ${SITE}/rss.xml`,
  '',
  '## 公开文章',
  '',
  ...items.map(
    (i) =>
      `- [${i.title}](${SITE}/posts/${encodeURIComponent(i.slug)})${i.summary ? `: ${i.summary.slice(0, 120)}` : ''}`,
  ),
  '',
].join('\n');

fs.writeFileSync(path.join(webDistDir, 'llms.txt'), llms, 'utf8');
console.log(
  `wrote rss.xml + llms.txt (${items.length} items) → ${webDistDir}`,
);
