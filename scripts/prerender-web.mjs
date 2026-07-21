/**
 * 在 vite build 之后生成可索引静态 HTML（含真实 title），再供 pagefind 索引。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/web/dist');
const contentFile = path.join(root, 'apps/web/src/generated/content.json');

if (!fs.existsSync(dist)) {
  console.error('dist missing; run vite build first');
  process.exit(1);
}
if (!fs.existsSync(contentFile)) {
  console.error('content.json missing; run content:gen first');
  process.exit(1);
}

const { items = [], posts = [] } = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
const docs = items.length ? items : posts;

function page(title, bodyHtml, extra = '') {
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 列表页
const listHtml = page(
  '文章 · Walker',
  `<ul>${docs
    .map(
      (d) =>
        `<li><a href="/posts/${encodeURIComponent(d.slug)}/">${escapeHtml(d.title)}</a></li>`,
    )
    .join('\n')}</ul>`,
);
fs.mkdirSync(path.join(dist, 'posts'), { recursive: true });
fs.writeFileSync(path.join(dist, 'posts', 'index.html'), listHtml);

// 详情页：title + body 纯文本供 pagefind
for (const d of docs) {
  const dir = path.join(dist, 'posts', d.slug);
  fs.mkdirSync(dir, { recursive: true });
  const body = `<article><p class="summary">${escapeHtml(d.summary || '')}</p><pre class="body">${escapeHtml(d.body.slice(0, 50000))}</pre></article>`;
  fs.writeFileSync(path.join(dir, 'index.html'), page(d.title, body));
}

// 首页增强：若已有 index.html 则注入 noscript 标题列表（保留 SPA）
const indexPath = path.join(dist, 'index.html');
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
