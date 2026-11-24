import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { expandWikiLinks } from '../../packages/shared/src/content';
import {
  SITE_AUTHOR,
  SITE_DEFAULT_IMAGE,
  SITE_LANGUAGE,
  SITE_NAME,
  siteAbsoluteUrl,
} from '../../packages/shared/src/site-identity';
import type { GeneratedContentItem } from './content-model';
import { fromRoot } from './paths';

type HtmlToken = { text: string };
type RendererLike = { html: (token: HtmlToken) => string };
type MarkedModule = {
  marked: {
    parse: (
      markdown: string,
      options: { gfm: boolean; breaks: boolean; renderer: RendererLike },
    ) => string | Promise<string>;
  };
  Renderer: new () => RendererLike;
};

export interface ArticleVersionSnapshot {
  version: number;
  note: string;
  publishedAt: string;
  body: string;
}

export interface PrerenderManifestData {
  buildId?: string;
  gitCommit?: string | null;
  items?: Array<{ slug: string; hash: string }>;
}

export interface PrerenderContext {
  distDir: string;
  viteTemplate: string;
  publicItems: GeneratedContentItem[];
  docs: GeneratedContentItem[];
  allBySlug: ReadonlyMap<string, GeneratedContentItem>;
  articleVersions: Record<string, ArticleVersionSnapshot[]>;
  buildId: string;
  gitCommit: string;
  contentHashesBySlug: ReadonlyMap<string, string>;
  renderMarkdown: (markdown: string) => string;
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function safeDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function displayDate(value: string): string {
  const iso = safeDate(value);
  return iso ? iso.slice(0, 10) : '';
}

export function isSafeRenderedUrl(value: string): boolean {
  const decoded = value
    .trim()
    .replace(/&colon;|&#58;|&#x3a;/gi, ':')
    .replace(/[\u0000-\u0020]+/g, '');
  if (!decoded) return false;
  if (/^(?:https?:|mailto:|\/|#|\.\.?\/)/i.test(decoded)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(decoded);
}

export function sanitizeRenderedUrls(html: string): string {
  return html.replace(
    /\s(href|src)="([^"]*)"/gi,
    (attribute, _name: string, value: string) => (isSafeRenderedUrl(value) ? attribute : ''),
  );
}

export function createMarkdownRenderer(knownSlugs: ReadonlySet<string>): (markdown: string) => string {
  const require = createRequire(import.meta.url);
  const markedPackage = path.join(
    path.dirname(require.resolve(fromRoot('apps/web/package.json'))),
    'node_modules/marked/lib/marked.cjs',
  );
  const { marked, Renderer } = require(markedPackage) as MarkedModule;

  return (markdown: string): string => {
    const renderer = new Renderer();
    renderer.html = ({ text }) => escapeHtml(text);
    const expanded = expandWikiLinks(markdown, (slug) =>
      knownSlugs.has(slug) ? `/posts/${encodeURIComponent(slug)}` : undefined,
    );
    const rendered = marked.parse(expanded, { gfm: true, breaks: false, renderer });
    if (typeof rendered !== 'string') {
      throw new Error('Markdown renderer unexpectedly returned a Promise');
    }
    return sanitizeRenderedUrls(rendered);
  };
}

export function renderMetaTags({
  title,
  description,
  pathname,
  type = 'website',
  image = SITE_DEFAULT_IMAGE,
  published = '',
  modified = '',
  tags = [],
  markdownPath = '',
  indexable = true,
  contentHash = '',
  buildId = '',
  gitCommit = '',
  canonicalPath = '',
}: {
  title: string;
  description: string;
  pathname: string;
  /** canonical 覆盖（默认 = pathname 自身；历史版本页指向当前版） */
  canonicalPath?: string;
  type?: 'website' | 'article' | 'profile';
  image?: string;
  published?: string;
  modified?: string;
  tags?: string[];
  markdownPath?: string;
  indexable?: boolean;
  contentHash?: string;
  buildId?: string;
  gitCommit?: string | null;
}): string {
  const canonical = siteAbsoluteUrl(canonicalPath || pathname);
  const socialImage = image || SITE_DEFAULT_IMAGE;
  const articleMeta = type === 'article'
    ? [
        published ? `<meta property="article:published_time" content="${escapeHtml(published)}" />` : '',
        modified ? `<meta property="article:modified_time" content="${escapeHtml(modified)}" />` : '',
        `<meta property="article:author" content="${escapeHtml(SITE_AUTHOR.url)}" />`,
        ...tags.map((tag) => `<meta property="article:tag" content="${escapeHtml(tag)}" />`),
      ]
        .filter(Boolean)
        .join('\n  ')
    : '';
  const markdownAlternate = markdownPath
    ? `<link rel="alternate" type="text/markdown" href="${escapeHtml(siteAbsoluteUrl(markdownPath))}" />`
    : '';

  return `<title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  ${contentHash ? `<meta name="content-hash" content="${escapeHtml(contentHash)}" />\n  ` : ''}${buildId ? `<meta name="build-id" content="${escapeHtml(buildId)}" />\n  ` : ''}${gitCommit ? `<meta name="git-commit" content="${escapeHtml(gitCommit)}" />\n  ` : ''}
  <meta name="author" content="${escapeHtml(SITE_AUTHOR.name)}" />
  <meta name="robots" content="${indexable ? 'index, follow' : 'noindex, follow'}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <link rel="alternate" type="application/rss+xml" title="${SITE_NAME} RSS" href="${siteAbsoluteUrl('/rss.xml')}" />
  <link rel="alternate" type="application/feed+json" title="${SITE_NAME} JSON Feed" href="${siteAbsoluteUrl('/feed.json')}" />
  ${markdownAlternate}
  <link rel="describedby" href="${siteAbsoluteUrl('/llms.txt')}" />
  <meta property="og:type" content="${type === 'profile' ? 'profile' : type}" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:locale" content="zh_CN" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:image" content="${escapeHtml(socialImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(socialImage)}" />
  ${articleMeta}`;
}

export function renderHtmlPage(
  viteTemplate: string,
  { head, body, schema }: { head: string; body: string; schema: unknown },
): string {
  let html = viteTemplate
    .replace(/\s*<title>[\s\S]*?<\/title>/i, '')
    .replace(
      '</head>',
      `  ${head}\n  <script id="site-json-ld" type="application/ld+json">${escapeJsonForHtml(schema)}</script>\n</head>`,
    )
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);

  if (!html.includes('<html lang=')) {
    html = html.replace('<html>', `<html lang="${SITE_LANGUAGE}">`);
  }
  return html;
}

export function writeHtmlRoute(distDir: string, pathname: string, html: string): void {
  if (pathname === '/') {
    fs.writeFileSync(path.join(distDir, 'index.html'), html, 'utf8');
    return;
  }
  const directory = path.join(distDir, pathname.replace(/^\//, ''));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), html, 'utf8');
}
