import { Link, useParams } from 'react-router-dom';
import { marked } from 'marked';
import { getPostBySlug } from '../content';
import { LikeButton } from '../components/LikeButton';
import { ContentFeedback } from '../components/ContentFeedback';
import { STATUS_LABELS } from '../shared/constants';
import { formatDateLocale } from '../shared/format';
import { estimateReadingMinutes } from '../shared/reading';

function parseDate(iso: string): Date {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function PostDetailPage() {
  const { slug = '' } = useParams();
  const post = getPostBySlug(decodeURIComponent(slug));
  if (!post) {
    return (
      <div className="panel-glass" style={{ padding: '1.5rem', borderRadius: 24 }}>
        <h1 className="page-title">未找到</h1>
        <Link to="/posts">返回列表</Link>
      </div>
    );
  }

  const html = marked.parse(post.body, { async: false }) as string;
  const likePath = `/posts/${post.slug}`;
  const mins = estimateReadingMinutes(post.body);
  const statusLabel = post.status ? STATUS_LABELS[post.status] ?? post.status : '';

  return (
    <article className="article-shell">
      <p className="meta">
        <Link to="/posts" style={{ color: 'var(--color-parchment-dim)' }}>
          文章
        </Link>
        {' / '}
        {post.slug}
      </p>
      <h1>{post.title}</h1>
      <p className="meta">
        {formatDateLocale(parseDate(post.date))} · {post.type}
        {statusLabel ? ` · ${statusLabel}` : ''}
        {` · 约 ${mins} 分钟阅读`}
        {post.tags.length ? ` · ${post.tags.slice(0, 4).join(' · ')}` : ''}
      </p>
      {post.summary ? (
        <p style={{ color: 'var(--color-parchment-dim)', marginBottom: '1.25rem' }}>
          {post.summary}
        </p>
      ) : null}
      <div className="panel-glass" style={{ padding: '1.5rem 1.6rem', borderRadius: 28 }}>
        <div className="prose-md" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <div style={{ marginTop: '1.25rem' }}>
        <LikeButton path={likePath} />
      </div>
      <ContentFeedback contentId={post.slug} />
    </article>
  );
}
