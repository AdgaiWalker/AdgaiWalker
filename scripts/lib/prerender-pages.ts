import fs from 'node:fs';
import {
  SITE_ROUTE_METADATA,
  buildCollectionJsonLdNode,
  buildCommonJsonLdNodes,
  buildProfilePageJsonLdNode,
  wrapJsonLdGraph,
} from '../../packages/shared/src/site-identity';
import type { KnowledgeGraph } from '../../packages/shared/src/graph';
import { CHAPTERS, chapterOf } from '../../apps/web/src/shared/chapters';
import { buildGraphOutline } from '../../apps/web/src/shared/graph-outline';
import { WEB_ROUTES } from '../../apps/web/src/shared/routes';
import { PROFILE } from '../../apps/web/src/data/profile';
import type { GeneratedContentItem } from './content-model';
import { graphJsonPath } from './paths';
import { AUTHOR, SITE_ORIGIN, SPA_SHELL_ROUTES, absoluteUrl } from './site';
import {
  displayDate,
  escapeHtml,
  renderHtmlPage,
  renderMetaTags,
  safeDate,
  writeHtmlRoute,
  type PrerenderContext,
} from './prerender-html';

/** 首页主张：React 首页与预渲染首帧同源（verify-geo 用它判断 SPA 壳是否误吐首页）。 */
export const HOMEPAGE_HEADLINE = PROFILE.greeting;

const routeMeta = (pathname: string) => SITE_ROUTE_METADATA[pathname]!;
const postHref = (slug: string) => `/posts/${encodeURIComponent(slug)}`;

function chapterLists(docs: GeneratedContentItem[], withSummary: boolean): string {
  return CHAPTERS.map((chapter) => {
    const items = docs.filter((doc) => chapterOf(doc) === chapter.id);
    const list = items
      .map(
        (doc) =>
          `<li><a href="${postHref(doc.slug)}">${escapeHtml(doc.title)}</a>${
            withSummary && doc.summary ? ` — ${escapeHtml(doc.summary)}` : ''
          } <time datetime="${escapeHtml(safeDate(doc.date))}">${escapeHtml(displayDate(doc.date))}</time></li>`,
      )
      .join('');
    return `<section id="${chapter.id}" aria-labelledby="ch-${chapter.id}">
    <h2 id="ch-${chapter.id}">${chapter.no} ${escapeHtml(chapter.label)}</h2>
    <p>${escapeHtml(chapter.dek)}</p>
    <ul>${list}</ul>
  </section>`;
  }).join('\n  ');
}

function renderHomepage(ctx: PrerenderContext): void {
  const { distDir, viteTemplate, docs } = ctx;
  const home = routeMeta('/');
  const body = `<main data-pagefind-body>
  <header>
    <h1>${HOMEPAGE_HEADLINE}</h1>
    ${PROFILE.intro.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n    ')}
    <nav aria-label="站点">
      <a href="/me">关于</a> · <a href="/#work">作品</a> · <a href="/posts">文章</a> · <a href="${WEB_ROUTES.graph}">脉络</a> · <a href="/tools">问</a>
    </nav>
  </header>
  ${chapterLists(docs, false)}
</main>`;
  writeHtmlRoute(
    distDir,
    '/',
    renderHtmlPage(viteTemplate, {
      head: renderMetaTags({ title: home.title, description: home.description, pathname: '/' }),
      body,
      schema: wrapJsonLdGraph(buildCommonJsonLdNodes('/', home.title, home.description)),
    }),
  );
}

function renderPostsIndex(ctx: PrerenderContext): void {
  const { distDir, viteTemplate, docs } = ctx;
  const meta = routeMeta('/posts');
  const body = `<main data-pagefind-body>
  <header><h1>文章</h1><p>${escapeHtml(meta.description)}</p></header>
  ${chapterLists(docs, true)}
  <p><a href="${WEB_ROUTES.graph}">看文章之间怎么连在一起（脉络）</a></p>
</main>`;
  writeHtmlRoute(
    distDir,
    '/posts',
    renderHtmlPage(viteTemplate, {
      head: renderMetaTags({ title: meta.title, description: meta.description, pathname: '/posts' }),
      body,
      schema: wrapJsonLdGraph([
        ...buildCommonJsonLdNodes('/posts', meta.title, meta.description),
        buildCollectionJsonLdNode({
          pathname: '/posts',
          title: meta.title,
          description: meta.description,
          items: docs.map((doc) => ({ url: absoluteUrl(postHref(doc.slug)), name: doc.title })),
        }),
      ]),
    }),
  );
}

function renderGraph(ctx: PrerenderContext): void {
  const { distDir, viteTemplate } = ctx;
  const graphMeta = routeMeta(WEB_ROUTES.graph);
  // canvas 对爬虫不可见，故 /graph 的静态正文必须是同源的语义化清单。
  const knowledgeGraph = JSON.parse(fs.readFileSync(graphJsonPath, 'utf8')) as KnowledgeGraph;
  const outline = buildGraphOutline(knowledgeGraph);
  const graphBody = `<main data-pagefind-body>
  <header>
    <h1>脉络</h1>
    <p>${escapeHtml(graphMeta.description)}</p>
    <p>${outline.entries.length} 篇文章 · ${outline.linkCount} 条正文互引 · ${outline.isolated.length} 篇还没连上</p>
  </header>
  <section>
    <h2>互引关系</h2>
    <ol>${outline.entries
      .map((entry) => {
        const links = entry.links
          .map((link) => (link.resolved ? `<a href="${postHref(link.slug)}">${escapeHtml(link.title)}</a>` : `<span>${escapeHtml(link.slug)}（尚不存在）</span>`))
          .join('、');
        return `<li><article id="${escapeHtml(entry.slug)}"><h3><a href="${postHref(entry.slug)}">${escapeHtml(entry.title)}</a></h3>${links ? `<p>引用：${links}</p>` : '<p>还没有引用任何文章</p>'}</article></li>`;
      })
      .join('')}</ol>
  </section>
  <section>
    <h2>还没连上（${outline.isolated.length} 篇）</h2>
    <ul>${outline.isolated.map((entry) => `<li><a href="${postHref(entry.slug)}">${escapeHtml(entry.title)}</a></li>`).join('')}</ul>
  </section>
  <p><a href="/posts">查看全部文章</a></p>
</main>`;
  writeHtmlRoute(
    distDir,
    WEB_ROUTES.graph,
    renderHtmlPage(viteTemplate, {
      head: renderMetaTags({ title: graphMeta.title, description: graphMeta.description, pathname: WEB_ROUTES.graph }),
      body: graphBody,
      schema: wrapJsonLdGraph([
        ...buildCommonJsonLdNodes(WEB_ROUTES.graph, graphMeta.title, graphMeta.description),
        buildCollectionJsonLdNode({
          pathname: WEB_ROUTES.graph,
          title: graphMeta.title,
          description: graphMeta.description,
          items: outline.entries.map((entry) => ({ url: absoluteUrl(postHref(entry.slug)), name: entry.title })),
        }),
      ]),
    }),
  );
}

function renderMe(ctx: PrerenderContext): void {
  const { distDir, viteTemplate } = ctx;
  const meMeta = routeMeta('/me');
  writeHtmlRoute(
    distDir,
    '/me',
    renderHtmlPage(viteTemplate, {
      head: renderMetaTags({ title: meMeta.title, description: meMeta.description, pathname: '/me', type: 'profile', image: AUTHOR.image }),
      body: `<main data-pagefind-body><article><h1>关于我</h1>${PROFILE.aboutLead.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}<p>关于人机分工与物理载体的最新想法，记在《<a href="${postHref(PROFILE.aboutLink.slug)}">${escapeHtml(PROFILE.aboutLink.title)}</a>》里。</p><p><a href="${SITE_ORIGIN}/posts">浏览 Wiki 全部条目</a> · <a href="/tools">问一步</a></p></article></main>`,
      schema: wrapJsonLdGraph([
        ...buildCommonJsonLdNodes('/me', meMeta.title, meMeta.description),
        buildProfilePageJsonLdNode('/me', meMeta.title),
      ]),
    }),
  );
}

/** 预渲染首页、文章目录、脉络、关于与 SPA 独立壳层路由。 */
export function prerenderStaticPages(ctx: PrerenderContext): void {
  renderHomepage(ctx);
  renderPostsIndex(ctx);
  renderGraph(ctx);
  renderMe(ctx);
  for (const route of SPA_SHELL_ROUTES) {
    writeHtmlRoute(
      ctx.distDir,
      route.pathname,
      renderHtmlPage(ctx.viteTemplate, {
        head: renderMetaTags({
          title: route.title,
          description: route.description,
          pathname: route.pathname,
          indexable: false,
        }),
        body: `<main><header><h1>${escapeHtml(route.heading)}</h1><p>${escapeHtml(route.description)}</p></header></main>`,
        schema: wrapJsonLdGraph(buildCommonJsonLdNodes(route.pathname, route.title, route.description)),
      }),
    );
  }
}
