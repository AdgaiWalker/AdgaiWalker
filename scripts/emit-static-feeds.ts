/**
 * emit-static-feeds — 从同一公开内容集合生成 sitemap、feeds 与 LLM 入口。
 * 触发：build-web（语义预渲染之后）
 */
import fs from 'node:fs';
import path from 'node:path';
import type {
  GeneratedContent,
  GeneratedContentItem,
} from './lib/content-model';
import { getBrowseItems } from './lib/content-model';
import { contentJsonPath, webDistDir } from './lib/paths';
import {
  absoluteUrl,
  AUTHOR,
  INDEXABLE_STATIC_ROUTES,
  SITE_DESCRIPTION,
  SITE_LANGUAGE,
  SITE_NAME,
  SITE_ORIGIN,
} from './lib/site';

function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isoDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function articlePath(item: GeneratedContentItem): string {
  return `/posts/${encodeURIComponent(item.slug)}`;
}

function articleMarkdownPath(item: GeneratedContentItem): string {
  return `${articlePath(item)}/index.md`;
}

function policyLabel(item: GeneratedContentItem): string {
  const policy = item.aiUsePolicy;
  return [
    policy.level || '未分级',
    policy.readable ? '可读取' : '不可供 AI 读取',
    policy.citable ? '可引用' : '不可引用',
    policy.actionable ? '可整理为行动步骤' : '不作为行动指令',
  ].join(' · ');
}

function markdownDocument(item: GeneratedContentItem): string {
  const canonical = absoluteUrl(articlePath(item));
  const resources = item.resources.filter((resource) => resource.url);
  return [
    `# ${item.title}`,
    '',
    `> ${item.summary}`,
    '',
    `- Canonical: ${canonical}`,
    `- 作者: ${item.author || AUTHOR.name} (${AUTHOR.url})`,
    `- 发布: ${isoDate(item.date)}`,
    `- 更新: ${isoDate(item.updated || item.date)}`,
    `- 标签: ${item.tags.join(', ') || '无'}`,
    `- AI 使用边界: ${policyLabel(item)}`,
    item.aiUsePolicy.reason ? `- 说明: ${item.aiUsePolicy.reason}` : '',
    '',
    '---',
    '',
    item.body.trim(),
    ...(resources.length
      ? [
          '',
          '## 来源与延伸资源',
          '',
          ...resources.map(
            (resource) =>
              `- [${resource.name}](${resource.url})${resource.description ? `: ${resource.description}` : ''}`,
          ),
        ]
      : []),
    '',
  ]
    .filter((line, index, lines) => {
      if (line !== '') return true;
      return index === 0 || lines[index - 1] !== '';
    })
    .join('\n');
}

if (!fs.existsSync(contentJsonPath)) {
  console.error('content.json missing; run content:gen first');
  process.exit(1);
}

const raw = JSON.parse(
  fs.readFileSync(contentJsonPath, 'utf8'),
) as GeneratedContent;
const browseItems = getBrowseItems(raw.items ?? []);
const llmItems = browseItems.filter((item) => item.aiUsePolicy.readable);

fs.mkdirSync(webDistDir, { recursive: true });

// RSS 与 JSON Feed 的条目契约 = 全部 browse 条目（verify-geo 按此双侧校验），不设上限
const rssItems = browseItems
  .map((item) => {
    const link = absoluteUrl(articlePath(item));
    const published = isoDate(item.date);
    if (!published) {
      throw new Error(`Invalid publication date for ${item.slug}`);
    }
    return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${new Date(published).toUTCString()}</pubDate>
      <dc:creator>${escapeXml(item.author || AUTHOR.name)}</dc:creator>
      ${item.tags.map((tag) => `<category>${escapeXml(tag)}</category>`).join('\n      ')}
      <description>${escapeXml(item.summary)}</description>
    </item>`;
  })
  .join('\n');

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${SITE_NAME} · iwalk.pro</title>
    <link>${SITE_ORIGIN}/</link>
    <atom:link href="${absoluteUrl('/rss.xml')}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>${SITE_LANGUAGE}</language>
${rssItems}
  </channel>
</rss>
`;
fs.writeFileSync(path.join(webDistDir, 'rss.xml'), rss, 'utf8');

const jsonFeed = {
  version: 'https://jsonfeed.org/version/1.1',
  title: `${SITE_NAME} · iwalk.pro`,
  home_page_url: `${SITE_ORIGIN}/`,
  feed_url: absoluteUrl('/feed.json'),
  description: SITE_DESCRIPTION,
  language: SITE_LANGUAGE,
  authors: [{ name: AUTHOR.name, url: AUTHOR.url, avatar: AUTHOR.image }],
  items: browseItems.map((item) => {
    const url = absoluteUrl(articlePath(item));
    return {
      id: url,
      url,
      title: item.title,
      summary: item.summary,
      content_text: item.body,
      date_published: isoDate(item.date),
      date_modified: isoDate(item.updated || item.date),
      authors: [{ name: item.author || AUTHOR.name, url: AUTHOR.url }],
      tags: item.tags,
      _ai_use_policy: item.aiUsePolicy,
    };
  }),
};
fs.writeFileSync(
  path.join(webDistDir, 'feed.json'),
  `${JSON.stringify(jsonFeed, null, 2)}\n`,
  'utf8',
);

const sitemapUrls = [
  ...INDEXABLE_STATIC_ROUTES.map(
    (pathname) => `  <url><loc>${escapeXml(absoluteUrl(pathname))}</loc></url>`,
  ),
  ...browseItems.map((item) => {
    const modified = isoDate(item.updated || item.date);
    return `  <url>
    <loc>${escapeXml(absoluteUrl(articlePath(item)))}</loc>
    ${modified ? `<lastmod>${modified.slice(0, 10)}</lastmod>` : ''}
  </url>`;
  }),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(webDistDir, 'sitemap.xml'), sitemap, 'utf8');

for (const item of llmItems) {
  const directory = path.join(webDistDir, 'posts', item.slug);
  if (!fs.existsSync(path.join(directory, 'index.html'))) {
    throw new Error(`Missing prerendered page for ${item.slug}`);
  }
  fs.writeFileSync(
    path.join(directory, 'index.md'),
    markdownDocument(item),
    'utf8',
  );
}

const citableItems = llmItems.filter((item) => item.aiUsePolicy.citable);
const backgroundItems = llmItems.filter((item) => !item.aiUsePolicy.citable);
const llms = [
  `# ${SITE_NAME} (iwalk.pro)`,
  '',
  `> ${SITE_DESCRIPTION}`,
  '',
  `作者主体是 [${AUTHOR.name}](${AUTHOR.url})；${SITE_NAME} 是站名。内容来自真实实践，并由 Git 中的 Markdown 维护。`,
  '',
  '## 主要入口',
  '',
  `- [首页](${SITE_ORIGIN}/): 站点入口`,
  `- [证据](${absoluteUrl('/posts')}): 教程、探索与札记`,
  `- [关于本站](${absoluteUrl('/about')}): 站点目标与边界`,
  `- [关于 duola](${AUTHOR.url}): 作者身份`,
  `- [RSS](${absoluteUrl('/rss.xml')})`,
  `- [JSON Feed](${absoluteUrl('/feed.json')})`,
  `- [完整 AI 阅读包](${absoluteUrl('/llms-full.txt')})`,
  '',
  '## 可引用内容',
  '',
  ...citableItems.map(
    (item) =>
      `- [${item.title}](${absoluteUrl(articleMarkdownPath(item))}): ${item.summary}`,
  ),
  ...(backgroundItems.length
    ? [
        '',
        '## 仅供背景阅读，不应引用',
        '',
        ...backgroundItems.map(
          (item) =>
            `- [${item.title}](${absoluteUrl(articleMarkdownPath(item))}): ${item.aiUsePolicy.reason || item.summary}`,
        ),
      ]
    : []),
  '',
  '## 使用边界',
  '',
  '- 每篇机器可读稿都标注自己的 AI 使用边界；以单篇标注为准。',
  '- 价格、产品、软件与渠道信息可能随时间变化，引用前请核验文章更新时间和原始来源。',
  '- 个人经历与观点不应被改写为普遍事实。',
  '',
].join('\n');
fs.writeFileSync(path.join(webDistDir, 'llms.txt'), llms, 'utf8');

const llmsFull = [
  `# ${SITE_NAME} 完整 AI 阅读包`,
  '',
  `> ${SITE_DESCRIPTION}`,
  '',
  `本文件包含 ${llmItems.length} 篇公开且允许 AI 读取的内容。每篇的引用边界独立标注。`,
  '',
  ...llmItems.flatMap((item) => [
    '---',
    '',
    markdownDocument(item).trim(),
    '',
  ]),
].join('\n');
fs.writeFileSync(
  path.join(webDistDir, 'llms-full.txt'),
  `${llmsFull.trim()}\n`,
  'utf8',
);

console.log(
  `wrote sitemap.xml, rss.xml, feed.json, llms.txt, llms-full.txt + ${llmItems.length} Markdown alternates`,
);
