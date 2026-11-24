import { isBrowsePostType } from '../../packages/shared/src/content';
import { deriveRelatedSlugs } from '../../packages/shared/src/graph';
import {
  articleHistoryLabel,
  articleHistorySummary,
  stripFrontmatterBlock,
} from '../../packages/shared/src/article-version';
import {
  buildBlogPostingJsonLdGraph,
  buildCommonJsonLdNodes,
  resolveSiteAssetUrl,
  wrapJsonLdGraph,
} from '../../packages/shared/src/site-identity';
import type { GeneratedContentItem } from './content-model';
import { AUTHOR } from './site';
import {
  displayDate,
  escapeHtml,
  renderHtmlPage,
  renderMetaTags,
  safeDate,
  writeHtmlRoute,
  type PrerenderContext,
} from './prerender-html';

/** 对全部 publicItems（含 wise 与 tool）输出独立静态详情页与 `<meta name="content-hash">`。 */
export function prerenderArticlePages(ctx: PrerenderContext): void {
  const {
    distDir,
    viteTemplate,
    publicItems,
    allBySlug,
    articleVersions,
    buildId,
    gitCommit,
    contentHashesBySlug,
    renderMarkdown,
  } = ctx;

  for (const doc of publicItems) {
    const isBrowse = isBrowsePostType(doc.type);
    const pathname = `/posts/${encodeURIComponent(doc.slug)}`;
    const contentHash = contentHashesBySlug.get(doc.slug) || '';
    const published = safeDate(doc.date);
    const modified = safeDate(doc.updated || doc.date) || published;
    const authorName = doc.author || AUTHOR.name;
    const image = resolveSiteAssetUrl(doc.image);
    const articleHtml = renderMarkdown(doc.body);
    const related = deriveRelatedSlugs(publicItems, doc.slug)
      .map((slug) => allBySlug.get(slug))
      .filter((item): item is GeneratedContentItem => Boolean(item));
    const resources = doc.resources.filter((resource) => resource.url);
    const historyLabel = articleHistoryLabel(articleVersions[doc.slug]?.length ?? 0);
    const visiblePolicy = doc.aiUsePolicy.readable
      ? `<aside aria-label="AI 使用说明"><p>AI 使用：可读取${doc.aiUsePolicy.citable ? ' · 可引用' : ' · 不可引用'}${doc.aiUsePolicy.actionable ? ' · 可转为行动步骤' : ''}。${doc.aiUsePolicy.reason ? ` ${escapeHtml(doc.aiUsePolicy.reason)}` : ''}</p></aside>`
      : '';
    const articleBody = `<main data-pagefind-body>
    <nav aria-label="面包屑"><a href="/">Walker</a> / <a href="/posts">证据</a></nav>
    <article>
      <header data-content-hash="${escapeHtml(contentHash)}">
        <h1>${escapeHtml(doc.title)}</h1>
        <p>作者：<a href="/me">${escapeHtml(authorName)}</a> · <time datetime="${escapeHtml(published)}">发布 ${escapeHtml(displayDate(doc.date))}</time>${modified && modified !== published ? ` · <time datetime="${escapeHtml(modified)}">更新 ${escapeHtml(displayDate(doc.updated))}</time>` : ''}${historyLabel ? ` · <a href="${escapeHtml(`${pathname}/history`)}">${escapeHtml(historyLabel)}</a>` : ''}</p>
        <p>${escapeHtml(doc.summary)}</p>
        ${doc.tags.length ? `<p>标签：${doc.tags.map(escapeHtml).join('、')}</p>` : ''}
      </header>
      <div class="prose-md">${articleHtml}</div>
      ${visiblePolicy}
      ${resources.length ? `<section><h2>来源与延伸资源</h2><ul>${resources.map((resource) => `<li><a href="${escapeHtml(resource.url)}">${escapeHtml(resource.name)}</a>${resource.description ? ` — ${escapeHtml(resource.description)}` : ''}</li>`).join('')}</ul></section>` : ''}
      ${related.length ? `<section><h2>相关内容</h2><ul>${related.map((item) => `<li><a href="/posts/${encodeURIComponent(item.slug)}">${escapeHtml(item.title)}</a></li>`).join('')}</ul></section>` : ''}
    </article>
  </main>`;

    writeHtmlRoute(
      distDir,
      pathname,
      renderHtmlPage(viteTemplate, {
        head: renderMetaTags({
          title: `${doc.title} · Walker`,
          description: doc.summary,
          pathname,
          type: 'article',
          image,
          published,
          modified,
          tags: doc.tags,
          indexable: isBrowse,
          markdownPath: isBrowse && doc.aiUsePolicy.readable ? `${pathname}/index.md` : '',
          contentHash,
          buildId,
          gitCommit,
        }),
        body: articleBody,
        schema: buildBlogPostingJsonLdGraph({
          pathname,
          browsePath: '/posts',
          title: doc.title,
          summary: doc.summary,
          published,
          modified,
          authorName,
          image,
          section: doc.series || doc.domain || doc.type,
          tags: doc.tags,
        }),
      }),
    );
  }
}

/** 预渲染文章公开演进史列表与各不可变历史版本静态页面（canonical 一律指向当前版）。 */
export function prerenderArticleVersionPages(ctx: PrerenderContext): void {
  const { distDir, viteTemplate, allBySlug, articleVersions, renderMarkdown } = ctx;
  for (const [versionSlug, versionList] of Object.entries(articleVersions)) {
    const versionDoc = allBySlug.get(versionSlug);
    if (!versionDoc || versionList.length === 0) continue;
    const currentPath = `/posts/${encodeURIComponent(versionSlug)}`;
    const historyPath = `${currentPath}/history`;
    const firstAt = versionList[0]!.publishedAt;
    const latestAt = versionList[versionList.length - 1]!.publishedAt;
    const historyBody = `<main data-pagefind-body>
    <nav aria-label="面包屑"><a href="/">Walker</a> / <a href="/posts">证据</a> / <a href="${escapeHtml(currentPath)}">${escapeHtml(versionDoc.title)}</a></nav>
    <header><h1>版本历史 · ${escapeHtml(versionDoc.title)}</h1>
    <p>${escapeHtml(
      versionList.length > 1
        ? articleHistorySummary({ count: versionList.length, firstPublishedAt: firstAt, latestPublishedAt: latestAt })
        : '本文只有一个公开版本——首版就是当前版，没有更早的内容可看。',
    )}</p></header>
    <ol>${[...versionList]
      .reverse()
      .map(
        (v) =>
          `<li><a href="${escapeHtml(currentPath)}/v/${v.version}"><strong>v${v.version}</strong></a> · <time datetime="${escapeHtml(v.publishedAt)}">${escapeHtml(v.publishedAt.slice(0, 10))}</time><p>${escapeHtml(v.note)}</p></li>`,
      )
      .join('')}</ol>
    <p><a href="${escapeHtml(currentPath)}">回到当前版本</a></p>
  </main>`;
    writeHtmlRoute(
      distDir,
      historyPath,
      renderHtmlPage(viteTemplate, {
        head: renderMetaTags({
          title: `版本历史 · ${versionDoc.title} · Walker`,
          description: `${versionDoc.title} 的公开版本演进史，共 ${versionList.length} 个版本`,
          pathname: historyPath,
          canonicalPath: currentPath,
        }),
        body: historyBody,
        schema: wrapJsonLdGraph(buildCommonJsonLdNodes(historyPath, `版本历史 · ${versionDoc.title}`, versionDoc.summary)),
      }),
    );

    for (const v of versionList) {
      const versionPath = `${currentPath}/v/${v.version}`;
      const versionHtml = renderMarkdown(stripFrontmatterBlock(v.body));
      const versionBody = `<main data-pagefind-body>
      <nav aria-label="面包屑"><a href="/">Walker</a> / <a href="/posts">证据</a> / <a href="${escapeHtml(currentPath)}">${escapeHtml(versionDoc.title)}</a> / <a href="${escapeHtml(historyPath)}">版本历史</a></nav>
      <article>
        <header>
          <h1>${escapeHtml(versionDoc.title)} <small>v${v.version}</small></h1>
          <p>发布于 <time datetime="${escapeHtml(v.publishedAt)}">${escapeHtml(displayDate(v.publishedAt))}</time></p>
          <p>这是历史版本，内容可能已过时；<a href="${escapeHtml(currentPath)}">当前版本见这里</a>。</p>
          <p>变更说明：${escapeHtml(v.note)}</p>
        </header>
        <div class="prose-md">${versionHtml}</div>
        <footer><p>本版本已永久保留（不可修改、不可删除）；如日后下架会在此说明。</p>
        <p><a href="${escapeHtml(historyPath)}">查看全部 ${versionList.length} 个版本</a> · <a href="${escapeHtml(currentPath)}">当前版本</a></p></footer>
      </article>
    </main>`;
      writeHtmlRoute(
        distDir,
        versionPath,
        renderHtmlPage(viteTemplate, {
          head: renderMetaTags({
            title: `${versionDoc.title} v${v.version} · Walker`,
            description: `${versionDoc.title} 的历史版本 v${v.version}（发布于 ${v.publishedAt.slice(0, 10)}）`,
            pathname: versionPath,
            canonicalPath: currentPath,
          }),
          body: versionBody,
          schema: wrapJsonLdGraph(buildCommonJsonLdNodes(versionPath, `${versionDoc.title} v${v.version}`, versionDoc.summary)),
        }),
      );
    }
  }
}
