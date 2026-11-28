/**
 * ArticleEnd — 文末收口：读后反馈 + 赞 + 复制链接 → 系列上下篇 → 文末回邮卡（寄出后原地打开围绕这篇的问答）→ 相连。
 */
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Link2 } from 'lucide-react';
import type { ContentItem } from '../../content';
import { useContentFeedback } from '../../hooks/useContentFeedback';
import { useLike } from '../../hooks/useLike';
import { trackWebEvent } from '../../lib/web-telemetry';
import type { SeriesNeighbors } from '../../shared/content-series';
import { dualEntry } from '../../shared/dual-entry';
import { ContentFeedback } from '../ui/ContentFeedback';
import { LikeButton } from '../ui/LikeButton';
import { AskPostcard } from '../paper/AskPostcard';
import { EntryList, postHref } from '../paper/EntryList';

const ArticleAssistantPanel = lazy(() =>
  import('../ui/ArticleAssistantPanel').then((m) => ({ default: m.ArticleAssistantPanel })),
);

type Props = {
  post: ContentItem;
  neighbors: SeriesNeighbors;
  related: readonly ContentItem[];
};

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="quiet-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {
          /* 剪贴板不可用时静默，地址栏仍可复制 */
        }
      }}
    >
      {copied ? <Check size={15} aria-hidden /> : <Link2 size={15} aria-hidden />}
      {copied ? '已复制' : '复制链接'}
    </button>
  );
}

export function ArticleEnd({ post, neighbors, related }: Props) {
  const like = useLike(`${dualEntry.browse.path}/${post.slug}`);
  const feedback = useContentFeedback(post.slug);
  const [pendingAsk, setPendingAsk] = useState<{ slug: string; text: string } | null>(null);

  return (
    <footer className="article-end">
      <div className="article-actions">
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
        <div className="article-actions-side">
          <LikeButton count={like.count} busy={like.busy} error={like.error} onLike={like.onLike} />
          <CopyLinkButton />
        </div>
      </div>

      {neighbors.prev || neighbors.next ? (
        <nav className="series-nav" aria-label="系列上下篇">
          {neighbors.prev ? (
            <Link to={postHref(neighbors.prev.slug)} className="series-nav-link">
              <span className="series-nav-dir">上一篇</span>
              <span className="series-nav-title">{neighbors.prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {neighbors.next ? (
            <Link to={postHref(neighbors.next.slug)} className="series-nav-link is-next">
              <span className="series-nav-dir">下一篇</span>
              <span className="series-nav-title">{neighbors.next.title}</span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      {pendingAsk?.slug === post.slug ? (
        <Suspense fallback={<p className="meta">正在打开…</p>}>
          <ArticleAssistantPanel key={post.slug} slug={post.slug} title={post.title} initialAsk={pendingAsk.text} />
        </Suspense>
      ) : (
        <AskPostcard
          onSend={(text) => {
            setPendingAsk({ slug: post.slug, text });
            trackWebEvent('web.article_ask_opened', { slug: post.slug });
          }}
        />
      )}

      {related.length > 0 ? (
        <section className="article-related" aria-labelledby="related-label">
          <p id="related-label" className="rail-label">
            与此篇相连
          </p>
          <EntryList items={related.slice(0, 5)} />
        </section>
      ) : null}
    </footer>
  );
}
