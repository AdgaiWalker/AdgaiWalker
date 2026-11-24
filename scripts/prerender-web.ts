/**
 * prerender-web — 基于 Vite 产物生成可索引、可引用、仍可启动 React 的静态页面。
 * 触发：build-web（Vite build 之后，GEO feeds 之前）
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GeneratedContent } from './lib/content-model';
import { getBrowseItems } from './lib/content-model';
import { contentJsonPath, webDistDir, webGeneratedDir } from './lib/paths';
import { INDEXABLE_STATIC_ROUTES, SPA_SHELL_ROUTES } from './lib/site';
import {
  createMarkdownRenderer,
  type ArticleVersionSnapshot,
  type PrerenderContext,
  type PrerenderManifestData,
} from './lib/prerender-html';
import { prerenderStaticPages } from './lib/prerender-pages';
import { prerenderArticlePages, prerenderArticleVersionPages } from './lib/prerender-articles';

if (!fs.existsSync(webDistDir)) {
  console.error('dist missing; run vite build first');
  process.exit(1);
}
if (!fs.existsSync(contentJsonPath)) {
  console.error('content.json missing; run content:gen first');
  process.exit(1);
}

const parsed = JSON.parse(fs.readFileSync(contentJsonPath, 'utf8')) as GeneratedContent;
const publicItems = parsed.items ?? [];
const docs = getBrowseItems(publicItems);
const allBySlug = new Map(publicItems.map((doc) => [doc.slug, doc]));

// 文章版本历史投影（content/versions 的静态化产物）；无文件即无历史，不阻断构建
const articleVersions = (() => {
  try {
    const loaded = JSON.parse(
      fs.readFileSync(path.join(webGeneratedDir, 'article-versions.json'), 'utf8'),
    ) as { articles?: Record<string, ArticleVersionSnapshot[]> };
    return loaded.articles ?? {};
  } catch {
    return {};
  }
})();

let manifestData: PrerenderManifestData = {};
try {
  const manifestPath = path.join(webGeneratedDir, 'public-manifest.json');
  if (fs.existsSync(manifestPath)) {
    manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PrerenderManifestData;
  }
} catch {
  /* ignore */
}

const contentHashesBySlug = new Map<string, string>();
for (const item of manifestData.items ?? []) {
  if (item.slug && item.hash) contentHashesBySlug.set(item.slug, item.hash);
}

const ctx: PrerenderContext = {
  distDir: webDistDir,
  viteTemplate: fs.readFileSync(path.join(webDistDir, 'index.html'), 'utf8'),
  publicItems,
  docs,
  allBySlug,
  articleVersions,
  buildId: manifestData.buildId || '',
  gitCommit: manifestData.gitCommit || '',
  contentHashesBySlug,
  renderMarkdown: createMarkdownRenderer(new Set(allBySlug.keys())),
};

prerenderStaticPages(ctx);
prerenderArticlePages(ctx);
prerenderArticleVersionPages(ctx);

try {
  const manifestSrc = path.join(webGeneratedDir, 'public-manifest.json');
  if (fs.existsSync(manifestSrc)) {
    fs.copyFileSync(manifestSrc, path.join(webDistDir, 'public-manifest.json'));
  }
} catch {
  /* ignore */
}

console.log(
  `prerendered ${INDEXABLE_STATIC_ROUTES.length} hub pages + ${SPA_SHELL_ROUTES.length} SPA shells + ${docs.length} articles`,
);
