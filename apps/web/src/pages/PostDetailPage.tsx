/**
 * 文章详情 — 正文 + 目录 + 进度 + 同主题线邻篇 + related。
 * 依赖：content 查询、outline 纯函数、赞/反馈 hooks。
 */
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Link2 } from 'lucide-react';
import { marked } from 'marked';
import {
  getPostBySlug,
  getRelatedPosts,
  getSeriesNeighborsForSlug,
  getVersionChain,
} from '../content';
import { ArticleToc } from '../components/ui/ArticleToc';
import { ContentFeedback } from '../components/ui/ContentFeedback';
import { GiscusComments } from '../components/ui/GiscusComments';
import { LikeButton } from '../components/ui/LikeButton';
import { ReadingProgress } from '../components/ui/ReadingProgress';
import { useContentFeedback } from '../hooks/useContentFeedback';
import { useLike } from '../hooks/useLike';
import { useReadingProgress } from '../hooks/useReadingProgress';
import { useTocActive } from '../hooks/useTocActive';
import { sanitizeHtml } from '../lib/sanitize-html';
import { buildArticleOutline } from '../shared/article-outline';
import { STATUS_LABELS } from '../shared/constants';
import { dualEntry } from '../shared/dual-entry';
import { formatDateLocale, parseIsoDate } from '../shared/format';
import { estimateReadingMinutes } from '../shared/reading';

export function PostDetailPage() {
  const { slug = '' } = useParams();
  const post = getPostBySlug(decodeURIComponent(slug));

  if (!post) {
    return (
      <div className="surface-l2" style={{ padding: '1.5rem' }}>
        <h1 className="page-title">未找到</h1>
        <Link to={dualEntry.browse.path}>返回列表</Link>
      </div>
    );
  }

  return <PostDetailBody key={post.slug} post={post} />;
}

function PostDetailBody({
  post,
}: {
  post: NonNullable<ReturnType<typeof getPostBySlug>>;
}) {
  const likePath = `${dualEntry.browse.path}/${post.slug}`;
  const like = useLike(likePath);
  const feedback = useContentFeedback(post.slug);
  const neighbors = getSeriesNeighborsForSlug(post.slug);
  const related = getRelatedPosts(post.slug);
  const versions = getVersionChain(post.slug);

  const { html, toc } = useMemo(() => {
    const rawHtml = marked.parse(post.body, { async: false }) as string;
    const safe = sanitizeHtml(rawHtml);
    return buildArticleOutline(safe);
  }, [post.body]);

  const tocIds = useMemo(() => toc.map((t) => t.id), [toc]);
  const activeId = useTocActive(tocIds);
  const progress = useReadingProgress(true);

  const mins = estimateReadingMinutes(post.body);
  const statusLabel = post.status ? STATUS_LABELS[post.status] ?? post.status : '';
  const seriesLabel = post.series?.trim() || '';

  return (
    <article className="article-shell">
      <ReadingProgress ratio={progress} />
      <p className="meta">
        <Link
          to={dualEntry.browse.path}
          style={{ color: 'var(--color-parchment-dim)' }}
        >
          {dualEntry.browse.title}
        </Link>
        {' / '}
        {post.slug}
      </p>
      <h1>{post.title}</h1>
      <p className="meta">
        {formatDateLocale(parseIsoDate(post.date))} · {post.type}
        {seriesLabel ? ` · ${seriesLabel}` : ''}
        {statusLabel ? ` · ${statusLabel}` : ''}
        {` · 约 ${mins} 分钟阅读`}
        {post.tags.length ? ` · ${post.tags.slice(0, 4).join(' · ')}` : ''}
      </p>
      {post.summary ? (
        <p
          style={{
            color: 'var(--color-parchment-dim)',
            marginBottom: '1.25rem',
          }}
        >
          {post.summary}
        </p>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: toc.length ? 'minmax(0,1fr) 12rem' : '1fr',
          gap: '1.25rem',
          alignItems: 'start',
        }}
      >
        <div className="surface-l2 article-body">
          <div
            className="prose-md"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
        {toc.length > 0 ? (
          <div style={{ position: 'sticky', top: '4.5rem' }}>
            <ArticleToc items={toc} activeId={activeId} />
          </div>
        ) : null}
      </div>

      {(neighbors.prev || neighbors.next) && (
        <nav
          className="surface-l2"
          aria-label="同主题线上下篇"
          style={{
            marginTop: '1.25rem',
            padding: '0.85rem 1.1rem',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          {neighbors.prev ? (
            <Link
              to={`${dualEntry.browse.path}/${encodeURIComponent(neighbors.prev.slug)}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                maxWidth: '48%',
              }}
            >
              <ChevronLeft size={16} aria-hidden />
              <span>
                <span className="meta" style={{ display: 'block' }}>
                  上一篇
                </span>
                {neighbors.prev.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {neighbors.next ? (
            <Link
              to={`${dualEntry.browse.path}/${encodeURIComponent(neighbors.next.slug)}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                maxWidth: '48%',
                marginLeft: 'auto',
                textAlign: 'right',
              }}
            >
              <span>
                <span className="meta" style={{ display: 'block' }}>
                  下一篇
                </span>
                {neighbors.next.title}
              </span>
              <ChevronRight size={16} aria-hidden />
            </Link>
          ) : null}
        </nav>
      )}

      {versions.length > 1 ? (
        <section
          className="surface-l2"
          style={{ marginTop: '1rem', padding: '0.85rem 1.1rem' }}
          aria-label="版本"
        >
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>版本</h2>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {versions.map((v) => (
              <li key={v.slug}>
                {v.slug === post.slug ? (
                  <strong>
                    {v.title}
                    {v.version != null ? ` · v${v.version}` : ' · 当前'}
                  </strong>
                ) : (
                  <Link
                    to={`${dualEntry.browse.path}/${encodeURIComponent(v.slug)}`}
                  >
                    {v.title}
                    {v.version != null ? ` · v${v.version}` : ''}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {related.length > 0 ? (
        <section
          className="surface-l2"
          style={{ marginTop: '1rem', padding: '0.85rem 1.1rem' }}
          aria-label="相关文章"
        >
          <h2
            style={{
              margin: '0 0 0.5rem',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Link2 size={16} aria-hidden />
            相关
          </h2>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  to={`${dualEntry.browse.path}/${encodeURIComponent(r.slug)}`}
                >
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="article-end">
        <LikeButton
          count={like.count}
          busy={like.busy}
          error={like.error}
          onLike={like.onLike}
        />
        <ContentFeedback
          done={feedback.done}
          error={feedback.error}
          note={feedback.note}
          pendingSignal={feedback.pendingSignal}
          busy={feedback.busy}
          onSelectUseful={feedback.onSelectUseful}
          onSelectNeedsMore={feedback.onSelectNeedsMore}
          onSelectOutdated={feedback.onSelectOutdated}
          onNoteChange={feedback.onNoteChange}
          onSubmitPending={feedback.onSubmitPending}
        />
      </div>

      <GiscusComments term={post.slug} />
    </article>
  );
}
