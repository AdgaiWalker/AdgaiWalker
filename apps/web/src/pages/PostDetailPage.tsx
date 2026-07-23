/**
 * 文章详情（页）— 沉浸阅读
 * 职责：单栏光学居中；浮动返回材质；壳层无侧栏。
 *
 * 依赖：content、sanitize、outline、反馈/赞/进度
 * 触发：路由 /posts/:slug
 */
import { useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Link2 } from 'lucide-react';
import { marked } from 'marked';
import {
  getPostBySlug,
  getRelatedPosts,
  getSeriesNeighborsForSlug,
  getVersionChain,
} from '../content';
import type { BrowseReturnState } from '../components/ItemList';
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

function browseHrefFromState(state: unknown): string {
  const s = state as BrowseReturnState | null;
  const q = s?.browseSearch?.trim();
  if (q) return `${dualEntry.browse.path}?${q}`;
  return dualEntry.browse.path;
}

export function PostDetailPage() {
  const { slug = '' } = useParams();
  const location = useLocation();
  const browseHref = browseHrefFromState(location.state);
  const returnState = location.state as BrowseReturnState | null;
  const post = getPostBySlug(decodeURIComponent(slug));

  if (!post) {
    return (
      <div className="reading-stage">
        <div className="reading-column reading-enter">
          <h1 className="page-title">未找到</h1>
          <Link to={browseHref} className="article-back-link">
            返回{dualEntry.browse.title}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PostDetailBody
      key={post.slug}
      post={post}
      browseHref={browseHref}
      returnState={returnState}
    />
  );
}

function PostDetailBody({
  post,
  browseHref,
  returnState,
}: {
  post: NonNullable<ReturnType<typeof getPostBySlug>>;
  browseHref: string;
  returnState: BrowseReturnState | null;
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
  const statusLabel = post.status
    ? (STATUS_LABELS[post.status] ?? post.status)
    : '';

  return (
    <div className="reading-stage">
      <ReadingProgress ratio={progress} />

      <header className="reading-chrome surface-chrome">
        <Link
          to={browseHref}
          className="reading-chrome-back"
          aria-label={`返回${dualEntry.browse.title}`}
        >
          <ArrowLeft size={18} aria-hidden />
          <span>{dualEntry.browse.title}</span>
        </Link>
        <span className="reading-chrome-title" title={post.title}>
          {post.title}
        </span>
        <span className="reading-chrome-spacer" aria-hidden />
      </header>

      <article className="reading-column article-shell reading-enter">
        <header className="article-header">
          <h1 className="article-display-title">{post.title}</h1>
          <p className="meta article-meta">
            {formatDateLocale(parseIsoDate(post.date))}
            {` · 约 ${mins} 分钟`}
            {statusLabel ? ` · ${statusLabel}` : ''}
          </p>
          {post.summary ? (
            <p className="article-summary">{post.summary}</p>
          ) : null}
        </header>

        <div className={`article-layout${toc.length ? ' has-toc' : ''}`}>
          {toc.length > 0 ? (
            <aside className="article-toc-aside" aria-label="目录">
              <ArticleToc items={toc} activeId={activeId} />
            </aside>
          ) : null}
          <div className="article-body">
            <div
              className="prose-md"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>

        {(neighbors.prev || neighbors.next) && (
          <nav className="article-neighbors" aria-label="上下篇">
            {neighbors.prev ? (
              <Link
                to={`${dualEntry.browse.path}/${encodeURIComponent(neighbors.prev.slug)}`}
                state={returnState ?? undefined}
                className="article-neighbor"
              >
                <ChevronLeft size={18} aria-hidden />
                <span>
                  <span className="meta">上一篇</span>
                  <span className="article-neighbor-title">
                    {neighbors.prev.title}
                  </span>
                </span>
              </Link>
            ) : (
              <span />
            )}
            {neighbors.next ? (
              <Link
                to={`${dualEntry.browse.path}/${encodeURIComponent(neighbors.next.slug)}`}
                state={returnState ?? undefined}
                className="article-neighbor is-next"
              >
                <span>
                  <span className="meta">下一篇</span>
                  <span className="article-neighbor-title">
                    {neighbors.next.title}
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden />
              </Link>
            ) : null}
          </nav>
        )}

        {versions.length > 1 ? (
          <section className="article-footer-block" aria-label="版本">
            <h2>版本</h2>
            <ul>
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
          <section className="article-footer-block" aria-label="相关">
            <h2>
              <Link2 size={16} aria-hidden />
              相关
            </h2>
            <ul>
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
    </div>
  );
}
