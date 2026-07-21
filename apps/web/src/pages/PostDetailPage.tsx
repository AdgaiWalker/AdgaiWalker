import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { marked } from 'marked';
import { getPostBySlug } from '../content';
import { ContentFeedback } from '../components/ui/ContentFeedback';
import { LikeButton } from '../components/ui/LikeButton';
import { useContentFeedback } from '../hooks/useContentFeedback';
import { useLike } from '../hooks/useLike';
import { sanitizeHtml } from '../lib/sanitize-html';
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

  return <PostDetailBody post={post} />;
}

function PostDetailBody({
  post,
}: {
  post: NonNullable<ReturnType<typeof getPostBySlug>>;
}) {
  const likePath = `${dualEntry.browse.path}/${post.slug}`;
  const like = useLike(likePath);
  const feedback = useContentFeedback(post.slug);

  const html = useMemo(() => {
    const rawHtml = marked.parse(post.body, { async: false }) as string;
    return sanitizeHtml(rawHtml);
  }, [post.body]);

  const mins = estimateReadingMinutes(post.body);
  const statusLabel = post.status ? STATUS_LABELS[post.status] ?? post.status : '';

  return (
    <article className="article-shell">
      <p className="meta">
        <Link to={dualEntry.browse.path} style={{ color: 'var(--color-parchment-dim)' }}>
          {dualEntry.browse.title}
        </Link>
        {' / '}
        {post.slug}
      </p>
      <h1>{post.title}</h1>
      <p className="meta">
        {formatDateLocale(parseIsoDate(post.date))} · {post.type}
        {statusLabel ? ` · ${statusLabel}` : ''}
        {` · 约 ${mins} 分钟阅读`}
        {post.tags.length ? ` · ${post.tags.slice(0, 4).join(' · ')}` : ''}
      </p>
      {post.summary ? (
        <p style={{ color: 'var(--color-parchment-dim)', marginBottom: '1.25rem' }}>
          {post.summary}
        </p>
      ) : null}
      <div className="surface-l2 article-body">
        <div className="prose-md" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
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
    </article>
  );
}
