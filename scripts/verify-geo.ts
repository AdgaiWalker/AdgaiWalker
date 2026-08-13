/**
 * verify-geo — 验证构建产物的 GEO/SEO 不变量，阻止 HTML 伪 sitemap 等回归。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GeneratedContent } from './lib/content-model';
import { getBrowseItems } from './lib/content-model';
import { contentJsonPath, webDistDir } from './lib/paths';
import { absoluteUrl, INDEXABLE_STATIC_ROUTES } from './lib/site';

function fail(message: string): never {
  throw new Error(`GEO verification failed: ${message}`);
}

function read(relativePath: string): string {
  const filePath = path.join(webDistDir, relativePath);
  if (!fs.existsSync(filePath)) fail(`missing ${relativePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function extractJsonLd(html: string, label: string): unknown {
  const match = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i,
  );
  assert(match, `${label} has no JSON-LD`);
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    fail(`${label} JSON-LD is invalid: ${(error as Error).message}`);
  }
}

const content = JSON.parse(
  fs.readFileSync(contentJsonPath, 'utf8'),
) as GeneratedContent;
const allItems = content.items ?? [];
const browseItems = getBrowseItems(allItems);
const readableItems = browseItems.filter((item) => item.aiUsePolicy.readable);

assert(browseItems.length > 0, 'no browse content was generated');
assert(
  new Set(browseItems.map((item) => item.slug)).size === browseItems.length,
  'duplicate public slugs',
);

for (const item of browseItems) {
  assert(item.summary.trim(), `${item.slug} has no summary`);
  assert(item.aiUsePolicy.level, `${item.slug} has no AI use policy level`);
  assert(!Number.isNaN(new Date(item.date).getTime()), `${item.slug} has invalid date`);
  assert(
    !Number.isNaN(new Date(item.updated || item.date).getTime()),
    `${item.slug} has invalid updated date`,
  );
}

for (const route of INDEXABLE_STATIC_ROUTES) {
  const relativePath =
    route === '/' ? 'index.html' : path.join(route.replace(/^\//, ''), 'index.html');
  const html = read(relativePath);
  const label = relativePath;
  assert(html.includes('<link rel="canonical"'), `${label} has no canonical`);
  assert(html.includes('property="og:title"'), `${label} has no Open Graph title`);
  assert(html.includes('name="twitter:card"'), `${label} has no Twitter card`);
  assert(/<script type="module"[^>]+src="\/assets\//.test(html), `${label} lost Vite JS`);
  assert(/<link rel="stylesheet"[^>]+href="\/assets\//.test(html), `${label} lost Vite CSS`);
  extractJsonLd(html, label);
}

for (const item of browseItems) {
  const relativeDir = path.join('posts', encodeURIComponent(item.slug));
  const html = read(path.join(relativeDir, 'index.html'));
  const canonical = absoluteUrl(`/posts/${encodeURIComponent(item.slug)}`);
  assert(html.includes('<article>'), `${item.slug} has no article element`);
  assert(html.includes('<h1>'), `${item.slug} has no h1`);
  assert(html.includes('class="prose-md"'), `${item.slug} has no semantic body`);
  assert(html.includes(`rel="canonical" href="${canonical}"`), `${item.slug} canonical mismatch`);
  assert(!html.includes('<pre class="body">'), `${item.slug} still uses raw Markdown pre`);
  assert(!html.includes('entry-hint.js'), `${item.slug} references removed entry-hint.js`);
  assert(!/\s(?:href|src)="javascript:/i.test(html), `${item.slug} contains unsafe URL`);
  assert(/<script type="module"[^>]+src="\/assets\//.test(html), `${item.slug} lost Vite JS`);
  assert(/<link rel="stylesheet"[^>]+href="\/assets\//.test(html), `${item.slug} lost Vite CSS`);

  const schema = extractJsonLd(html, item.slug) as {
    '@graph'?: Array<{ '@type'?: string }>;
  };
  assert(
    schema['@graph']?.some((node) => node['@type'] === 'BlogPosting'),
    `${item.slug} JSON-LD has no BlogPosting`,
  );

  const markdownPath = path.join(relativeDir, 'index.md');
  if (item.aiUsePolicy.readable) {
    const markdown = read(markdownPath);
    assert(markdown.includes(`Canonical: ${canonical}`), `${item.slug} Markdown canonical mismatch`);
    assert(html.includes('type="text/markdown"'), `${item.slug} has no Markdown alternate`);
  } else {
    assert(!fs.existsSync(path.join(webDistDir, markdownPath)), `${item.slug} leaked Markdown alternate`);
    assert(!html.includes('type="text/markdown"'), `${item.slug} advertises forbidden Markdown`);
  }
}

const sitemap = read('sitemap.xml');
assert(sitemap.startsWith('<?xml'), 'sitemap is not XML');
assert(sitemap.includes('<urlset'), 'sitemap has no urlset');
assert(!/<html/i.test(sitemap), 'sitemap is an HTML shell');
const sitemapLocs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(
  (match) => match[1],
);
const expectedLocs = [
  ...INDEXABLE_STATIC_ROUTES.map(absoluteUrl),
  ...browseItems.map((item) =>
    absoluteUrl(`/posts/${encodeURIComponent(item.slug)}`),
  ),
];
assert(
  JSON.stringify(sitemapLocs) === JSON.stringify(expectedLocs),
  'sitemap routes diverge from public static pages',
);

const rss = read('rss.xml');
assert(rss.startsWith('<?xml'), 'RSS is not XML');
assert(!/<html/i.test(rss), 'RSS is an HTML shell');
assert(
  (rss.match(/<item>/g) ?? []).length === browseItems.length,
  'RSS item count diverges from browse content',
);

const jsonFeed = JSON.parse(read('feed.json')) as { items?: Array<{ id: string }> };
assert(
  jsonFeed.items?.length === browseItems.length,
  'JSON Feed item count diverges from browse content',
);

const llms = read('llms.txt');
const llmsFull = read('llms-full.txt');
assert(!/<html/i.test(llms), 'llms.txt is an HTML shell');
assert(!/<html/i.test(llmsFull), 'llms-full.txt is an HTML shell');
for (const item of readableItems) {
  assert(
    llms.includes(absoluteUrl(`/posts/${encodeURIComponent(item.slug)}/index.md`)),
    `llms.txt omits ${item.slug}`,
  );
  assert(
    llmsFull.includes(`\n# ${item.title}\n`),
    `llms-full.txt omits ${item.slug}`,
  );
}
for (const item of allItems.filter((entry) => !browseItems.includes(entry))) {
  assert(
    !llms.includes(`/posts/${encodeURIComponent(item.slug)}/index.md`),
    `llms.txt leaks non-browse content ${item.slug}`,
  );
}

const robots = read('robots.txt');
assert(
  robots.includes(`Sitemap: ${absoluteUrl('/sitemap.xml')}`),
  'robots.txt points at the wrong sitemap',
);

console.log(
  `GEO verified: ${browseItems.length} pages, ${readableItems.length} Markdown alternates, sitemap + RSS + JSON Feed + JSON-LD`,
);
