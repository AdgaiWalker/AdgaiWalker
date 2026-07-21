/**
 * prerender-web — vite dist 上生成可索引静态 HTML（真实 title）
 * 依赖：paths、content.json
 * 被调用：build-web
 */
import fs from 'node:fs';
import path from 'node:path';
import { contentJsonPath, webDistDir } from './lib/paths';

if (!fs.existsSync(webDistDir)) {
  console.error('dist missing; run vite build first');
  process.exit(1);
}
if (!fs.existsSync(contentJsonPath)) {
  console.error('content.json missing; run content:gen first');
  process.exit(1);
}

type Doc = { slug: string; title: string; summary?: string; body: string };

const parsed = JSON.parse(fs.readFileSync(contentJsonPath, 'utf8')) as {
  items?: Doc[];
  posts?: Doc[];
};
const docs = parsed.items?.length ? parsed.items : (parsed.posts ?? []);

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(title: string, bodyHtml: string, extra = ''): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(title)}" />
</head>
<body>
  <main data-pagefind-body>
    <h1>${escapeHtml(title)}</h1>
    ${bodyHtml}
    ${extra}
  </main>
  <p><a href="/">Walker</a> · <a href="/posts/">文章</a></p>
  <script type="module" src="/assets/entry-hint.js"></script>
</body>
</html>
`;
}

const listHtml = page(
  '文章 · Walker',
  `<ul>${docs
    .map(
      (d) =>
        `<li><a href="/posts/${encodeURIComponent(d.slug)}/">${escapeHtml(d.title)}</a></li>`,
    )
    .join('\n')}</ul>`,
);
fs.mkdirSync(path.join(webDistDir, 'posts'), { recursive: true });
fs.writeFileSync(path.join(webDistDir, 'posts', 'index.html'), listHtml);

for (const d of docs) {
  const dir = path.join(webDistDir, 'posts', d.slug);
  fs.mkdirSync(dir, { recursive: true });
  const body = `<article><p class="summary">${escapeHtml(d.summary || '')}</p><pre class="body">${escapeHtml((d.body || '').slice(0, 50000))}</pre></article>`;
  fs.writeFileSync(path.join(dir, 'index.html'), page(d.title, body));
}

const indexPath = path.join(webDistDir, 'index.html');
if (fs.existsSync(indexPath)) {
  let index = fs.readFileSync(indexPath, 'utf8');
  const inject = `<noscript data-pagefind-body><h1>Walker — 行过万里水路</h1><ul>${docs
    .slice(0, 20)
    .map((d) => `<li>${escapeHtml(d.title)}</li>`)
    .join('')}</ul></noscript>`;
  if (!index.includes('data-pagefind-body')) {
    index = index.replace('</body>', `${inject}</body>`);
    fs.writeFileSync(indexPath, index);
  }
}

console.log(`prerendered ${docs.length} content pages under dist/posts/`);
