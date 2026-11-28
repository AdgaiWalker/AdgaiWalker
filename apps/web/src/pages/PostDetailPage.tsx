/**
 * 文章详情（页）— 纸页阅读：左侧吸顶目录 + 660px 正文 + 文末收口。
 * 章节归属（看见 / 用好 / 造物）与系列位置写在标题上方，随时可退回所在章。
 */
import { useMemo, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { marked } from 'marked';
import { articleHistoryLabel, articleVersionListPath, expandWikiLinks } from '@walker/shared';
import {
  getPostBySlug,
  getPostsBySeries,
  getRelatedPosts,
  getSeriesNeighborsForSlug,
  type ContentItem,
} from '../content';
import { getArticleVersions } from '../article-versions';
import { ArticleEnd } from '../components/article/ArticleEnd';
import { ArticleStrip } from '../components/article/ArticleStrip';
import { postHref } from '../components/paper/EntryList';
import { useCodeCopyButtons } from '../hooks/useCodeCopyButtons';
import { useTocActive } from '../hooks/useTocActive';
import { sanitizeHtml } from '../lib/sanitize-html';
import { buildArticleOutline } from '../shared/article-outline';
import { chapterById, chapterOf } from '../shared/chapters';
import { STATUS_LABELS } from '../shared/constants';
import { dualEntry } from '../shared/dual-entry';
import { parseIsoDate } from '../shared/format';
import { estimateReadingMinutes } from '../shared/reading';
import { CHAPTER_QUERY_KEY, WEB_ROUTES } from '../shared/routes';

function isoDay(iso: string): string {
  const d = parseIsoDate(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function PostDetailPage() {
  const { slug = '' } = useParams();
  const post = getPostBySlug(decodeURIComponent(slug));

  if (!post) {
    return (
      <div className="measure page-head">
        <h1 className="page-title">没有这篇</h1>
        <p className="page-dek">
          链接可能已改名。<Link to={dualEntry.browse.path}>回到文章目录</Link>
        </p>
      </div>
    );
  }
  return <PostDetailBody key={post.slug} post={post} />;
}

function PostDetailBody({ post }: { post: ContentItem }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const chapter = chapterById(chapterOf(post));
  const chapterHref = `${WEB_ROUTES.browse}?${CHAPTER_QUERY_KEY}=${chapter.id}`;
  const neighbors = getSeriesNeighborsForSlug(post.slug);
  const related = getRelatedPosts(post.slug, [neighbors.prev?.slug, neighbors.next?.slug]);
  const seriesItems = post.series?.trim() ? getPostsBySeries(post.series.trim()) : [];
  const seriesIndex = seriesItems.findIndex((item) => item.slug === post.slug);
  const historyLabel = articleHistoryLabel(getArticleVersions(post.slug).length);
  const statusLabel = post.status ? (STATUS_LABELS[post.status] ?? '') : '';

  const { html, toc } = useMemo(() => {
    const markdown = expandWikiLinks(post.body, (target) => {
      const hit = getPostBySlug(target);
      return hit ? postHref(hit.slug) : undefined;
    });
    return buildArticleOutline(sanitizeHtml(marked.parse(markdown, { async: false }) as string));
  }, [post.body]);

  const tocIds = useMemo(() => toc.map((t) => t.id), [toc]);
  const activeId = useTocActive(tocIds);
  useCodeCopyButtons(bodyRef, html);

  return (
    <div className="article-page">
      <ArticleStrip
        title={post.title}
        slug={post.slug}
        series={post.series}
        backHref={chapterHref}
        backLabel={chapter.label}
        titleRef={titleRef}
      />

      <div className="wrap article-grid">
        <aside className="article-rail" aria-label="目录与脉络">
          <div className="article-rail-inner">
            {toc.length > 1 ? (
              <nav aria-label="目录">
                <p className="rail-label">目录</p>
                <ol className="toc">
                  {toc.map((item) => (
                    <li key={item.id} className={item.level === 3 ? 'is-sub' : undefined}>
                      <a href={`#${item.id}`} aria-current={activeId === item.id ? 'location' : undefined}>
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}
            <p className="rail-label">
              <Link to={`${WEB_ROUTES.graph}?focus=${encodeURIComponent(post.slug)}`} className="rail-link">
                本文脉络 →
              </Link>
            </p>
          </div>
        </aside>

        <article className="article">
          <header className="article-head">
            <p className="kicker">
              <Link to={chapterHref}>
                {chapter.no} {chapter.label}
              </Link>
              {seriesIndex >= 0 ? (
                <span>
                  {' · '}
                  {post.series} {seriesIndex + 1}/{seriesItems.length}
                </span>
              ) : null}
            </p>
            <h1 ref={titleRef} className="article-title" tabIndex={-1}>
              {post.title}
            </h1>
            <dl className="article-meta">
              <div>
                <dt>发布</dt>
                <dd>
                  <time dateTime={isoDay(post.date)}>{isoDay(post.date)}</time>
                </dd>
              </div>
              <div>
                <dt>阅读</dt>
                <dd>
                  约 {estimateReadingMinutes(post.body)} 分钟{statusLabel ? ` · ${statusLabel}` : ''}
                </dd>
              </div>
              <div>
                <dt>修订</dt>
                <dd>
                  {historyLabel ? (
                    <Link to={articleVersionListPath(post.slug)}>{historyLabel}</Link>
                  ) : (
                    '首版'
                  )}
                </dd>
              </div>
            </dl>
          </header>

          <div ref={bodyRef} className="prose" dangerouslySetInnerHTML={{ __html: html }} />

          {post.resources?.length ? (
            <section className="article-resources" aria-labelledby="res-label">
              <p id="res-label" className="rail-label">
                项目入口
              </p>
              <ul className="entry-list">
                {post.resources.map((resource) => (
                  <li key={`${resource.type}:${resource.url}`}>
                    <a className="entry" href={resource.url} target="_blank" rel="noreferrer">
                      <span className="entry-title">{resource.name}</span>
                      <span className="entry-meta">↗</span>
                      {resource.description ? <span className="entry-dek">{resource.description}</span> : null}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <ArticleEnd post={post} neighbors={neighbors} related={related} />
        </article>
      </div>
    </div>
  );
}
