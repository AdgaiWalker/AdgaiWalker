import fs from 'node:fs';
import {
  SITE_ROUTE_METADATA,
  buildAboutPageJsonLdNode,
  buildCollectionJsonLdNode,
  buildCommonJsonLdNodes,
  buildProfilePageJsonLdNode,
  wrapJsonLdGraph,
} from '../../packages/shared/src/site-identity';
import type { KnowledgeGraph } from '../../packages/shared/src/graph';
import { buildGraphOutline } from '../../apps/web/src/shared/graph-outline';
import { WEB_ROUTES } from '../../apps/web/src/shared/routes';
import type { GeneratedContentItem } from './content-model';
import { fromRoot, graphJsonPath } from './paths';
import {
  AUTHOR,
  INDEXABLE_STATIC_ROUTES,
  SITE_ORIGIN,
  SPA_SHELL_ROUTES,
  absoluteUrl,
} from './site';
import {
  displayDate,
  escapeHtml,
  renderHtmlPage,
  renderMetaTags,
  safeDate,
  writeHtmlRoute,
  type PrerenderContext,
} from './prerender-html';

const routeMeta = (pathname: string) => SITE_ROUTE_METADATA[pathname]!;

function writeCollectionRoute(
  ctx: PrerenderContext,
  {
    pathname,
    heading,
    items,
    hrefFor = (item) => `/posts/${encodeURIComponent(item.slug)}`,
  }: {
    pathname: (typeof INDEXABLE_STATIC_ROUTES)[number];
    heading: string;
    items: GeneratedContentItem[];
    hrefFor?: (item: GeneratedContentItem) => string;
  },
): void {
  const { title, description } = routeMeta(pathname);
  const listItems = items.map((item) => ({ url: absoluteUrl(hrefFor(item)), name: item.title }));
  const body = `<main data-pagefind-body>
    <header><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(description)}</p></header>
    ${items.length ? `<ol>${items.map((item) => `<li><article id="${escapeHtml(item.slug)}"><h2><a href="${escapeHtml(hrefFor(item))}">${escapeHtml(item.title)}</a></h2><p>${escapeHtml(item.summary)}</p></article></li>`).join('')}</ol>` : '<p>内容仍在整理中。</p>'}
    <p><a href="/posts">查看全部证据</a></p>
  </main>`;
  writeHtmlRoute(
    ctx.distDir,
    pathname,
    renderHtmlPage(ctx.viteTemplate, {
      head: renderMetaTags({ title, description, pathname }),
      body,
      schema: wrapJsonLdGraph([
        ...buildCommonJsonLdNodes(pathname, title, description),
        buildCollectionJsonLdNode({ pathname, title, description, items: listItems }),
      ]),
    }),
  );
}

function renderHomepageAndHubs(ctx: PrerenderContext): void {
  const { distDir, viteTemplate, publicItems, docs } = ctx;
  const home = routeMeta('/');
  const homepageBody = `<main data-pagefind-body>
  <header>
    <p>Walker · 行过万里水路</p>
    <h1>想解决一个问题，还是逛逛新的可能？</h1>
    <p>${escapeHtml(home.description)}</p>
    <nav aria-label="主要入口">
      <a href="/tools">提问：拿下一步</a>
      <a href="/posts">文章：读证据</a>
      <a href="${WEB_ROUTES.graph}">结构：知识图谱</a>
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
      .map((doc) => `<li><a href="/posts/${encodeURIComponent(doc.slug)}">${escapeHtml(doc.title)}</a>${doc.summary ? ` — ${escapeHtml(doc.summary)}` : ''}</li>`)
      .join('')}</ul>
  </section>
</main>`;
  writeHtmlRoute(
    distDir,
    '/',
    renderHtmlPage(viteTemplate, {
      head: renderMetaTags({ title: home.title, description: home.description, pathname: '/' }),
      body: homepageBody,
      schema: wrapJsonLdGraph(buildCommonJsonLdNodes('/', home.title, home.description)),
    }),
  );

  writeCollectionRoute(ctx, {
    pathname: '/tutorials',
    heading: '教程',
    items: docs.filter((item) => item.hall === 'condition' || item.type === 'learn'),
  });
  writeCollectionRoute(ctx, {
    pathname: WEB_ROUTES.explore,
    heading: '探索',
    items: docs.filter((item) => item.hall === 'showcase' || item.type === 'idea' || item.type === 'project'),
  });
  writeCollectionRoute(ctx, {
    pathname: WEB_ROUTES.lab,
    heading: '札记',
    items: docs.filter((item) => item.hall === 'lab'),
  });
  writeCollectionRoute(ctx, {
    pathname: '/tools/resources',
    heading: '资源',
    items: publicItems.filter((item) => item.type === 'tool'),
    hrefFor: (item) => `/tools/resources#${encodeURIComponent(item.slug)}`,
  });
  writeCollectionRoute(ctx, {
    pathname: '/learn',
    heading: '学习',
    items: docs.filter((item) => item.type === 'learn'),
  });
  writeCollectionRoute(ctx, {
    pathname: '/advance',
    heading: '前进三部曲',
    items: docs.filter((item) => item.series === '前进三部曲').sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0)),
  });
  writeCollectionRoute(ctx, {
    pathname: '/projects/ferry',
    heading: 'Ferry',
    items: docs.filter((item) => item.series === 'Ferry').sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0)),
  });
}

function renderGearAndPosts(ctx: PrerenderContext): void {
  const { distDir, viteTemplate, docs } = ctx;
  const gearData = JSON.parse(fs.readFileSync(fromRoot('apps/web/src/data/gear.json'), 'utf8')) as {
    methodology: string;
    scenes: Array<{
      key: string;
      label: string;
      description: string;
      items: Array<{ name: string; price: string; why: string; guide?: string }>;
    }>;
  };
  const gearMeta = routeMeta('/gear');
  const gearBody = `<main data-pagefind-body>
  <header><h1>Dora 与硬件</h1><p>${escapeHtml(gearMeta.description)}</p></header>
  <p>${escapeHtml(gearData.methodology)}</p>
  ${gearData.scenes
    .map(
      (scene) => `<section>
    <h2>${escapeHtml(scene.label)}</h2>
    <p>${escapeHtml(scene.description)}</p>
    <ul>${scene.items
      .map((item) => {
        const name = item.guide ? `<a href="${escapeHtml(item.guide)}">${escapeHtml(item.name)}</a>` : escapeHtml(item.name);
        return `<li>${name} — ${escapeHtml(item.price)}。${escapeHtml(item.why)}</li>`;
      })
      .join('')}</ul>
  </section>`,
    )
    .join('')}
  <p><a href="/tutorials">相关教程</a></p>
</main>`;
  writeHtmlRoute(
    distDir,
    '/gear',
    renderHtmlPage(viteTemplate, {
      head: renderMetaTags({ title: gearMeta.title, description: gearMeta.description, pathname: '/gear' }),
      body: gearBody,
      schema: wrapJsonLdGraph(buildCommonJsonLdNodes('/gear', gearMeta.title, gearMeta.description)),
    }),
  );

  const postsMeta = routeMeta('/posts');
  const labCount = docs.filter((doc) => doc.hall === 'lab').length;
  const postsBody = `<main data-pagefind-body>
  <header><h1>文章</h1><p>${escapeHtml(postsMeta.description)}</p></header>
  <nav aria-label="内容路径">
    <a href="${WEB_ROUTES.lab}"><strong>札记</strong> — 经验与思考，在实践中持续生长 · ${labCount} 篇</a>
    <a href="${WEB_ROUTES.graph}"><strong>结构</strong> — 看文章之间谁引用了谁</a>
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
  writeHtmlRoute(
    distDir,
    '/posts',
    renderHtmlPage(viteTemplate, {
      head: renderMetaTags({ title: postsMeta.title, description: postsMeta.description, pathname: '/posts' }),
      body: postsBody,
      schema: wrapJsonLdGraph([
        ...buildCommonJsonLdNodes('/posts', postsMeta.title, postsMeta.description),
        buildCollectionJsonLdNode({
          pathname: '/posts',
          title: postsMeta.title,
          description: postsMeta.description,
          items: docs.map((doc) => ({ url: absoluteUrl(`/posts/${encodeURIComponent(doc.slug)}`), name: doc.title })),
        }),
      ]),
    }),
  );
}

function renderGraphAndIdentityPages(ctx: PrerenderContext): void {
  const { distDir, viteTemplate } = ctx;
  const graphMeta = routeMeta(WEB_ROUTES.graph);
  // canvas 对爬虫不可见，故 /graph 的静态正文必须是同源的语义化清单（PRD §6.1-C）。
  const knowledgeGraph = JSON.parse(fs.readFileSync(graphJsonPath, 'utf8')) as KnowledgeGraph;
  const outline = buildGraphOutline(knowledgeGraph);
  const postHref = (slug: string) => `/posts/${encodeURIComponent(slug)}`;
  const graphBody = `<main data-pagefind-body>
  <header>
    <h1>结构</h1>
    <p>${escapeHtml(graphMeta.description)}</p>
    <p>${outline.entries.length} 篇文章 · ${outline.linkCount} 条正文互引 · ${outline.isolated.length} 篇孤岛 · ${outline.tagCount} 个标签 · ${outline.ghosts.length} 个坏链</p>
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
    <h2>孤岛（${outline.isolated.length} 篇）</h2>
    <p>这些文章在正文里没有与任何文章互相引用；孤立不是错误，但读者很难从别处走到它们。</p>
    <ul>${outline.isolated.map((entry) => `<li><a href="${postHref(entry.slug)}">${escapeHtml(entry.title)}</a></li>`).join('')}</ul>
  </section>
  ${outline.ghosts.length ? `<section><h2>被引用但尚不存在的笔记</h2><ul>${outline.ghosts.map((ghost) => `<li>${escapeHtml(ghost.slug)} — 被 ${escapeHtml(ghost.referencedBy.join('、'))} 引用</li>`).join('')}</ul></section>` : ''}
  <section>
    <h2>主题线</h2>
    <ul>${outline.series.map((series) => `<li>${escapeHtml(series.name)}（${series.slugs.length} 篇）：${series.slugs.map((slug) => escapeHtml(slug)).join('、')}</li>`).join('')}</ul>
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

  const aboutMeta = routeMeta('/about');
  writeHtmlRoute(
    distDir,
    '/about',
    renderHtmlPage(viteTemplate, {
      head: renderMetaTags({ title: aboutMeta.title, description: aboutMeta.description, pathname: '/about' }),
      body: `<main data-pagefind-body><article><h1>关于 Walker</h1><p>${escapeHtml(aboutMeta.description)}</p><h2>现在能做什么</h2><p>从「提问」描述真实问题并拿下一步，或从「文章」阅读教程、探索与札记。</p><h2>边界</h2><p>Walker 是站名；人是 Dora，知识主权在人。公开内容是知识库的可读切片，不是批量生成的公知堆。</p><p><a href="/me">关于 Dora</a> · <a href="/posts">阅读文章</a></p></article></main>`,
      schema: wrapJsonLdGraph([
        ...buildCommonJsonLdNodes('/about', aboutMeta.title, aboutMeta.description),
        buildAboutPageJsonLdNode('/about', aboutMeta.title, aboutMeta.description),
      ]),
    }),
  );

  const meMeta = routeMeta('/me');
  writeHtmlRoute(
    distDir,
    '/me',
    renderHtmlPage(viteTemplate, {
      head: renderMetaTags({ title: meMeta.title, description: meMeta.description, pathname: '/me', type: 'profile', image: AUTHOR.image }),
      body: `<main data-pagefind-body><article><img src="/images/dora.jpg" alt="Dora" width="500" height="500" /><h1>Dora</h1><p>${escapeHtml(meMeta.description)}</p><p>人是主体；Walker 是站名，不是我的名字。</p><p><a href="${SITE_ORIGIN}/posts">阅读我的公开文章</a></p></article></main>`,
      schema: wrapJsonLdGraph([
        ...buildCommonJsonLdNodes('/me', meMeta.title, meMeta.description),
        buildProfilePageJsonLdNode('/me', meMeta.title),
      ]),
    }),
  );
}

/** 预渲染首页、集合枢纽页、图谱大纲、关于/个人页与 SPA 独立壳层路由。 */
export function prerenderStaticPages(ctx: PrerenderContext): void {
  renderHomepageAndHubs(ctx);
  renderGearAndPosts(ctx);
  renderGraphAndIdentityPages(ctx);
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
