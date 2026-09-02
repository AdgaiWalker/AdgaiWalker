/**
 * prerender-web — 基于 Vite 产物生成可索引、可引用、仍可启动 React 的静态页面。
 * 触发：build-web（Vite build 之后，GEO feeds 之前）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { expandWikiLinks } from '../packages/shared/src/content';
import type {
  GeneratedContent,
  GeneratedContentItem,
} from './lib/content-model';
import { getBrowseItems } from './lib/content-model';
import { contentJsonPath, fromRoot, webDistDir } from './lib/paths';
import { WEB_ROUTES } from '../apps/web/src/shared/routes';
import {
  absoluteUrl,
  AUTHOR,
  INDEXABLE_STATIC_ROUTES,
  SPA_SHELL_ROUTES,
  SITE_DESCRIPTION,
  SITE_LANGUAGE,
  SITE_NAME,
  SITE_ORIGIN,
  SITE_TITLE,
} from './lib/site';

if (!fs.existsSync(webDistDir)) {
  console.error('dist missing; run vite build first');
  process.exit(1);
}
if (!fs.existsSync(contentJsonPath)) {
  console.error('content.json missing; run content:gen first');
  process.exit(1);
}

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

const require = createRequire(import.meta.url);
const markedPackage = path.join(
  path.dirname(require.resolve('../apps/web/package.json')),
  'node_modules/marked/lib/marked.cjs',
);
const { marked, Renderer } = require(markedPackage) as MarkedModule;

const parsed = JSON.parse(
  fs.readFileSync(contentJsonPath, 'utf8'),
) as GeneratedContent;
const publicItems = parsed.items ?? [];
const docs = getBrowseItems(publicItems);
const docsBySlug = new Map(docs.map((doc) => [doc.slug, doc]));
const viteTemplate = fs.readFileSync(path.join(webDistDir, 'index.html'), 'utf8');

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function safeDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function displayDate(value: string): string {
  const iso = safeDate(value);
  return iso ? iso.slice(0, 10) : '';
}

function defaultImageUrl(): string {
  return absoluteUrl('/images/hero-bg.png');
}

function articleImageUrl(doc: GeneratedContentItem): string {
  if (!doc.image) return '';
  if (/^https?:\/\//i.test(doc.image)) return doc.image;
  return absoluteUrl(doc.image);
}

function metaTags({
  title,
  description,
  pathname,
  type = 'website',
  image = defaultImageUrl(),
  published = '',
  modified = '',
  tags = [],
  markdownPath = '',
  indexable = true,
}: {
  title: string;
  description: string;
  pathname: string;
  type?: 'website' | 'article' | 'profile';
  image?: string;
  published?: string;
  modified?: string;
  tags?: string[];
  markdownPath?: string;
  indexable?: boolean;
}): string {
  const canonical = absoluteUrl(pathname);
  const socialImage = image || defaultImageUrl();
  const articleMeta =
    type === 'article'
      ? [
          published
            ? `<meta property="article:published_time" content="${escapeHtml(published)}" />`
            : '',
          modified
            ? `<meta property="article:modified_time" content="${escapeHtml(modified)}" />`
            : '',
          `<meta property="article:author" content="${escapeHtml(AUTHOR.url)}" />`,
          ...tags.map(
            (tag) =>
              `<meta property="article:tag" content="${escapeHtml(tag)}" />`,
          ),
        ]
          .filter(Boolean)
          .join('\n  ')
      : '';
  const markdownAlternate = markdownPath
    ? `<link rel="alternate" type="text/markdown" href="${escapeHtml(absoluteUrl(markdownPath))}" />`
    : '';

  return `<title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="author" content="${escapeHtml(AUTHOR.name)}" />
  <meta name="robots" content="${indexable ? 'index, follow' : 'noindex, follow'}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <link rel="alternate" type="application/rss+xml" title="${SITE_NAME} RSS" href="${absoluteUrl('/rss.xml')}" />
  <link rel="alternate" type="application/feed+json" title="${SITE_NAME} JSON Feed" href="${absoluteUrl('/feed.json')}" />
  ${markdownAlternate}
  <link rel="describedby" href="${absoluteUrl('/llms.txt')}" />
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

function renderPage({
  head,
  body,
  schema,
}: {
  head: string;
  body: string;
  schema: unknown;
}): string {
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

function rendererWithEscapedHtml(): RendererLike {
  const renderer = new Renderer();
  renderer.html = ({ text }) => escapeHtml(text);
  return renderer;
}

function isSafeRenderedUrl(value: string): boolean {
  const decoded = value
    .trim()
    .replace(/&colon;|&#58;|&#x3a;/gi, ':')
    .replace(/[\u0000-\u0020]+/g, '');
  if (!decoded) return false;
  if (/^(?:https?:|mailto:|\/|#|\.\.?\/)/i.test(decoded)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(decoded);
}

function sanitizeRenderedUrls(html: string): string {
  return html.replace(
    /\s(href|src)="([^"]*)"/gi,
    (attribute, _name: string, value: string) =>
      isSafeRenderedUrl(value) ? attribute : '',
  );
}

function renderMarkdown(markdown: string): string {
  const expanded = expandWikiLinks(markdown, (slug) =>
    docsBySlug.has(slug) ? `/posts/${encodeURIComponent(slug)}` : undefined,
  );
  const rendered = marked.parse(expanded, {
    gfm: true,
    breaks: false,
    renderer: rendererWithEscapedHtml(),
  });
  if (typeof rendered !== 'string') {
    throw new Error('Markdown renderer unexpectedly returned a Promise');
  }
  return sanitizeRenderedUrls(rendered);
}

function commonGraph(pathname: string, title: string, description: string) {
  const url = absoluteUrl(pathname);
  return [
    {
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      url: `${SITE_ORIGIN}/`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: SITE_LANGUAGE,
      publisher: { '@id': `${AUTHOR.url}#person` },
    },
    {
      '@type': 'Person',
      '@id': `${AUTHOR.url}#person`,
      name: AUTHOR.name,
      url: AUTHOR.url,
      image: AUTHOR.image,
    },
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: title,
      description,
      isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
      inLanguage: SITE_LANGUAGE,
    },
  ];
}

function writeCollectionRoute({
  pathname,
  title,
  heading,
  description,
  items,
  hrefFor = (item) => `/posts/${encodeURIComponent(item.slug)}`,
}: {
  pathname: (typeof INDEXABLE_STATIC_ROUTES)[number];
  title: string;
  heading: string;
  description: string;
  items: GeneratedContentItem[];
  hrefFor?: (item: GeneratedContentItem) => string;
}): void {
  const url = absoluteUrl(pathname);
  const itemList = items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    url: absoluteUrl(hrefFor(item)),
    name: item.title,
  }));
  const body = `<main data-pagefind-body>
    <header><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(description)}</p></header>
    ${items.length ? `<ol>${items.map((item) => `<li><article id="${escapeHtml(item.slug)}"><h2><a href="${escapeHtml(hrefFor(item))}">${escapeHtml(item.title)}</a></h2><p>${escapeHtml(item.summary)}</p></article></li>`).join('')}</ol>` : '<p>内容仍在整理中。</p>'}
    <p><a href="/posts">查看全部证据</a></p>
  </main>`;
  writeRoute(
    pathname,
    renderPage({
      head: metaTags({ title, description, pathname }),
      body,
      schema: {
        '@context': 'https://schema.org',
        '@graph': [
          ...commonGraph(pathname, title, description),
          {
            '@type': 'CollectionPage',
            '@id': `${url}#collection`,
            url,
            name: title,
            description,
            mainEntity: { '@type': 'ItemList', itemListElement: itemList },
          },
        ],
      },
    }),
  );
}

function writeRoute(pathname: string, html: string): void {
  if (pathname === '/') {
    fs.writeFileSync(path.join(webDistDir, 'index.html'), html, 'utf8');
    return;
  }
  const directory = path.join(webDistDir, pathname.replace(/^\//, ''));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), html, 'utf8');
}

const homepageBody = `<main data-pagefind-body>
  <header>
    <p>Walker · 行过万里水路</p>
    <h1>想解决一个问题，还是逛逛新的可能？</h1>
    <p>${escapeHtml(SITE_DESCRIPTION)}</p>
    <nav aria-label="主要入口">
      <a href="/tools">卡：拿下一步</a>
      <a href="/posts">逛：读证据</a>
      <a href="/tutorials">教程</a>
      <a href="/learn">学习</a>
      <a href="${WEB_ROUTES.explore}">探索</a>
      <a href="/lab">札记</a>
      <a href="/gear">装备</a>
      <a href="/about">关于本站</a>
    </nav>
  </header>
  <section aria-labelledby="latest-heading">
    <h2 id="latest-heading">最近证据</h2>
    <ul>${docs
      .slice(0, 10)
      .map(
        (doc) =>
          `<li><a href="/posts/${encodeURIComponent(doc.slug)}">${escapeHtml(doc.title)}</a>${doc.summary ? ` — ${escapeHtml(doc.summary)}` : ''}</li>`,
      )
      .join('')}</ul>
  </section>
</main>`;
writeRoute(
  '/',
  renderPage({
    head: metaTags({
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      pathname: '/',
    }),
    body: homepageBody,
    schema: {
      '@context': 'https://schema.org',
      '@graph': commonGraph('/', SITE_TITLE, SITE_DESCRIPTION),
    },
  }),
);

writeCollectionRoute({
  pathname: '/tutorials',
  title: '教程 · Walker',
  heading: '教程',
  description: '来自真实使用的步骤与经验：搞到条件、跟上工具，照着可以开始做。',
  items: docs.filter((item) => item.hall === 'condition' || item.type === 'learn'),
});

writeCollectionRoute({
  pathname: WEB_ROUTES.explore,
  title: '探索 · Walker',
  heading: '探索',
  description:
    '从一个念头开始，在实践里逐渐长成：点子可以持续推进，项目是被明确立项的持续交付。',
  items: docs.filter(
    (item) =>
      item.hall === 'showcase' ||
      item.type === 'idea' ||
      item.type === 'project',
  ),
});

writeCollectionRoute({
  pathname: WEB_ROUTES.lab,
  title: '札记 · Walker',
  heading: '札记',
  description: '实验中沉淀的经验与思考；观点保留形成时的边界，并通过实践继续更新。',
  items: docs.filter((item) => item.hall === 'lab'),
});

writeCollectionRoute({
  pathname: '/tools/resources',
  title: '资源 · Walker',
  heading: '资源',
  description: 'duola 实际在用或了解的群、工具与引路人；外部服务与本站无利益关系，使用前请自行核验。',
  items: publicItems.filter((item) => item.type === 'tool'),
  hrefFor: (item) => `/tools/resources#${encodeURIComponent(item.slug)}`,
});

writeCollectionRoute({
  pathname: '/learn',
  title: '学习 · Walker',
  heading: '学习',
  description: '沿着真实任务进入教程和学习路径。',
  items: docs.filter((item) => item.type === 'learn'),
});

writeCollectionRoute({
  pathname: '/advance',
  title: '前进三部曲 · Walker',
  heading: '前进三部曲',
  description: '为什么走、路上留下什么，以及想走向哪里。',
  items: docs
    .filter((item) => item.series === '前进三部曲')
    .sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0)),
});

writeCollectionRoute({
  pathname: '/projects/ferry',
  title: 'Ferry · Walker',
  heading: 'Ferry',
  description: '从差距到行动、做减法并持续迭代的思考线。',
  items: docs
    .filter((item) => item.series === 'Ferry')
    .sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0)),
});

const gearData = JSON.parse(
  fs.readFileSync(fromRoot('apps/web/src/data/gear.json'), 'utf8'),
) as {
  methodology: string;
  scenes: Array<{
    key: string;
    label: string;
    description: string;
    items: Array<{ name: string; price: string; why: string; guide?: string }>;
  }>;
};
const gearTitle = '装备 · Walker';
const gearDescription = 'duola 当前使用的设备与工作组合。';
const gearBody = `<main data-pagefind-body>
  <header><h1>哆啦与硬件</h1><p>${escapeHtml(gearDescription)}</p></header>
  <p>${escapeHtml(gearData.methodology)}</p>
  ${gearData.scenes
    .map(
      (scene) => `<section>
    <h2>${escapeHtml(scene.label)}</h2>
    <p>${escapeHtml(scene.description)}</p>
    <ul>${scene.items
      .map((item) => {
        const name = item.guide
          ? `<a href="${escapeHtml(item.guide)}">${escapeHtml(item.name)}</a>`
          : escapeHtml(item.name);
        return `<li>${name} — ${escapeHtml(item.price)}。${escapeHtml(item.why)}</li>`;
      })
      .join('')}</ul>
  </section>`,
    )
    .join('')}
  <p><a href="/tutorials">相关教程</a></p>
</main>`;
writeRoute(
  '/gear',
  renderPage({
    head: metaTags({
      title: gearTitle,
      description: gearDescription,
      pathname: '/gear',
    }),
    body: gearBody,
    schema: {
      '@context': 'https://schema.org',
      '@graph': commonGraph('/gear', gearTitle, gearDescription),
    },
  }),
);

const postsTitle = '证据 · Walker';
const postsDescription =
  'duola 公开的思考与实践记录：来自真实经历，沿时间持续生长，可按主题阅读与引用。';
const labCount = docs.filter((doc) => doc.hall === 'lab').length;
const postsBody = `<main data-pagefind-body>
  <header><h1>证据</h1><p>${escapeHtml(postsDescription)}</p></header>
  <nav aria-label="内容路径">
    <a href="${WEB_ROUTES.lab}"><strong>札记</strong> — 经验与思考，在实践中持续生长 · ${labCount} 篇</a>
  </nav>
  <ol>${docs
    .map(
      (doc) => `<li>
        <article>
          <h2><a href="/posts/${encodeURIComponent(doc.slug)}">${escapeHtml(doc.title)}</a></h2>
          <p>${escapeHtml(doc.summary)}</p>
          <time datetime="${escapeHtml(safeDate(doc.updated || doc.date))}">${escapeHtml(displayDate(doc.updated || doc.date))}</time>
        </article>
      </li>`,
    )
    .join('')}</ol>
</main>`;
writeRoute(
  '/posts',
  renderPage({
    head: metaTags({
      title: postsTitle,
      description: postsDescription,
      pathname: '/posts',
    }),
    body: postsBody,
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        ...commonGraph('/posts', postsTitle, postsDescription),
        {
          '@type': 'CollectionPage',
          '@id': `${absoluteUrl('/posts')}#collection`,
          url: absoluteUrl('/posts'),
          name: postsTitle,
          description: postsDescription,
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: docs.map((doc, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              url: absoluteUrl(`/posts/${encodeURIComponent(doc.slug)}`),
              name: doc.title,
            })),
          },
        },
      ],
    },
  }),
);

const aboutTitle = '关于本站 · Walker';
const aboutDescription =
  'Walker 是 duola 的个人知识与行动样板站：人的认识沉淀为知识库，服务判断与行动，再由实践回灌知识。';
writeRoute(
  '/about',
  renderPage({
    head: metaTags({
      title: aboutTitle,
      description: aboutDescription,
      pathname: '/about',
    }),
    body: `<main data-pagefind-body><article><h1>关于 Walker</h1><p>${escapeHtml(aboutDescription)}</p><h2>现在能做什么</h2><p>从「卡」描述真实问题并拿下一步，或从「逛」阅读教程、探索与札记。</p><h2>边界</h2><p>Walker 是站名；人是 duola，知识主权在人。公开内容是知识库的可读切片，不是批量生成的公知堆。</p><p><a href="/me">关于 duola</a> · <a href="/posts">阅读证据</a></p></article></main>`,
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        ...commonGraph('/about', aboutTitle, aboutDescription),
        {
          '@type': 'AboutPage',
          '@id': `${absoluteUrl('/about')}#about`,
          url: absoluteUrl('/about'),
          name: aboutTitle,
          description: aboutDescription,
          about: { '@id': `${SITE_ORIGIN}/#website` },
        },
      ],
    },
  }),
);

const meTitle = 'duola · 关于我';
const meDescription =
  'duola，艺术生，在用 AI 解决真实问题：把真实卡点变成可检验的下一步，把走过的路收成公开证据。';
writeRoute(
  '/me',
  renderPage({
    head: metaTags({
      title: meTitle,
      description: meDescription,
      pathname: '/me',
      type: 'profile',
      image: AUTHOR.image,
    }),
    body: `<main data-pagefind-body><article><img src="/images/duola.jpg" alt="duola" width="500" height="500" /><h1>duola</h1><p>${escapeHtml(meDescription)}</p><p>人是主体；Walker 是站名，不是我的名字。</p><p><a href="${SITE_ORIGIN}/posts">阅读我的公开证据</a></p></article></main>`,
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        ...commonGraph('/me', meTitle, meDescription),
        {
          '@type': 'ProfilePage',
          '@id': `${absoluteUrl('/me')}#profile`,
          url: absoluteUrl('/me'),
          name: meTitle,
          mainEntity: { '@id': `${AUTHOR.url}#person` },
        },
      ],
    },
  }),
);

for (const doc of docs) {
  const pathname = `/posts/${encodeURIComponent(doc.slug)}`;
  const canonical = absoluteUrl(pathname);
  const published = safeDate(doc.date);
  const modified = safeDate(doc.updated || doc.date) || published;
  const authorName = doc.author || AUTHOR.name;
  const image = articleImageUrl(doc);
  const articleHtml = renderMarkdown(doc.body);
  const related = doc.related
    .map((slug) => docsBySlug.get(slug))
    .filter((item): item is GeneratedContentItem => Boolean(item));
  const resources = doc.resources.filter((resource) => resource.url);
  const visiblePolicy = doc.aiUsePolicy.readable
    ? `<aside aria-label="AI 使用说明"><p>AI 使用：可读取${doc.aiUsePolicy.citable ? ' · 可引用' : ' · 不可引用'}${doc.aiUsePolicy.actionable ? ' · 可转为行动步骤' : ''}。${doc.aiUsePolicy.reason ? ` ${escapeHtml(doc.aiUsePolicy.reason)}` : ''}</p></aside>`
    : '';
  const articleBody = `<main data-pagefind-body>
    <nav aria-label="面包屑"><a href="/">Walker</a> / <a href="/posts">证据</a></nav>
    <article>
      <header>
        <h1>${escapeHtml(doc.title)}</h1>
        <p>作者：<a href="/me">${escapeHtml(authorName)}</a> · <time datetime="${escapeHtml(published)}">发布 ${escapeHtml(displayDate(doc.date))}</time>${modified && modified !== published ? ` · <time datetime="${escapeHtml(modified)}">更新 ${escapeHtml(displayDate(doc.updated))}</time>` : ''}</p>
        <p>${escapeHtml(doc.summary)}</p>
        ${doc.tags.length ? `<p>标签：${doc.tags.map(escapeHtml).join('、')}</p>` : ''}
      </header>
      <div class="prose-md">${articleHtml}</div>
      ${visiblePolicy}
      ${resources.length ? `<section><h2>来源与延伸资源</h2><ul>${resources.map((resource) => `<li><a href="${escapeHtml(resource.url)}">${escapeHtml(resource.name)}</a>${resource.description ? ` — ${escapeHtml(resource.description)}` : ''}</li>`).join('')}</ul></section>` : ''}
      ${related.length ? `<section><h2>相关内容</h2><ul>${related.map((item) => `<li><a href="/posts/${encodeURIComponent(item.slug)}">${escapeHtml(item.title)}</a></li>`).join('')}</ul></section>` : ''}
    </article>
  </main>`;
  const articleSchema: Record<string, unknown> = {
    '@type': 'BlogPosting',
    '@id': `${canonical}#article`,
    url: canonical,
    mainEntityOfPage: { '@id': `${canonical}#webpage` },
    headline: doc.title,
    description: doc.summary,
    datePublished: published,
    dateModified: modified,
    author: { '@id': `${AUTHOR.url}#person`, name: authorName },
    publisher: { '@id': `${AUTHOR.url}#person` },
    inLanguage: SITE_LANGUAGE,
    articleSection: doc.series || doc.domain || doc.type,
    keywords: doc.tags,
    isAccessibleForFree: true,
  };
  if (image) articleSchema.image = image;

  writeRoute(
    pathname,
    renderPage({
      head: metaTags({
        title: `${doc.title} · Walker`,
        description: doc.summary,
        pathname,
        type: 'article',
        image,
        published,
        modified,
        tags: doc.tags,
        markdownPath: doc.aiUsePolicy.readable ? `${pathname}/index.md` : '',
      }),
      body: articleBody,
      schema: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': `${SITE_ORIGIN}/#website`,
            url: `${SITE_ORIGIN}/`,
            name: SITE_NAME,
            description: SITE_DESCRIPTION,
            inLanguage: SITE_LANGUAGE,
          },
          {
            '@type': 'WebPage',
            '@id': `${canonical}#webpage`,
            url: canonical,
            name: doc.title,
            description: doc.summary,
            isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
            breadcrumb: { '@id': `${canonical}#breadcrumb` },
            inLanguage: SITE_LANGUAGE,
          },
          articleSchema,
          {
            '@type': 'Person',
            '@id': `${AUTHOR.url}#person`,
            name: authorName,
            url: AUTHOR.url,
            image: AUTHOR.image,
          },
          {
            '@type': 'BreadcrumbList',
            '@id': `${canonical}#breadcrumb`,
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: SITE_NAME,
                item: `${SITE_ORIGIN}/`,
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: '证据',
                item: absoluteUrl('/posts'),
              },
              {
                '@type': 'ListItem',
                position: 3,
                name: doc.title,
                item: canonical,
              },
            ],
          },
        ],
      },
    }),
  );
}
for (const route of SPA_SHELL_ROUTES) {
  writeRoute(
    route.pathname,
    renderPage({
      head: metaTags({
        title: route.title,
        description: route.description,
        pathname: route.pathname,
        indexable: false,
      }),
      body: `<main>
    <header>
      <h1>${escapeHtml(route.heading)}</h1>
      <p>${escapeHtml(route.description)}</p>
    </header>
  </main>`,
      schema: {
        '@context': 'https://schema.org',
        '@graph': commonGraph(route.pathname, route.title, route.description),
      },
    }),
  );
}

console.log(
  `prerendered ${INDEXABLE_STATIC_ROUTES.length} hub pages + ${SPA_SHELL_ROUTES.length} SPA shells + ${docs.length} articles`,
);
