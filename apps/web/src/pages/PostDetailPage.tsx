/**
 * 文章详情（页）— 沉浸阅读
 * 职责：单栏光学居中；View Transition 标题落焦；文末高信噪比收口（3 个次要区块按需点击加载，平时 0 像素）。
 */
import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  MessageCircle,
  MessageSquare,
  Network,
} from 'lucide-react';
import { marked } from 'marked';
import {
  articleHistoryLabel,
  articleVersionListPath,
  expandWikiLinks,
  findGraphNode,
  noteNodeId,
} from '@walker/shared';
import {
  getPostBySlug,
  getRelatedPosts,
  getSeriesNeighborsForSlug,
} from '../content';
import { getGraphBodies, getKnowledgeGraph } from '../graph';
import { getArticleVersions } from '../article-versions';
import { createContentGraphDomain } from '../components/graph/domains';
import type { BrowseReturnState } from '../components/ItemList';
import { ArticleToc } from '../components/ui/ArticleToc';
import { ArticleShare } from '../components/ui/ArticleShare';
import { ContentFeedback } from '../components/ui/ContentFeedback';
import { GiscusComments, hasGiscusConfig } from '../components/ui/GiscusComments';
import { LikeButton } from '../components/ui/LikeButton';
import { ReadingProgress } from '../components/ui/ReadingProgress';
import { useContentFeedback } from '../hooks/useContentFeedback';
import { useCodeCopyButtons } from '../hooks/useCodeCopyButtons';
import { useLike } from '../hooks/useLike';
import { useReadingProgress } from '../hooks/useReadingProgress';
import { useTocActive } from '../hooks/useTocActive';
import { sanitizeHtml } from '../lib/sanitize-html';
import { buildArticleOutline } from '../shared/article-outline';
import { STATUS_LABELS } from '../shared/constants';
import { dualEntry } from '../shared/dual-entry';
import { formatDateLocale, parseIsoDate } from '../shared/format';
import { estimateReadingMinutes } from '../shared/reading';
import { WEB_ROUTES } from '../shared/routes';

const KnowledgeGraph = lazy(() =>
  import('../components/graph/KnowledgeGraph').then((m) => ({ default: m.KnowledgeGraph })),
);
const ArticleAssistantPanel = lazy(() =>
  import('../components/ui/ArticleAssistantPanel').then((m) => ({
    default: m.ArticleAssistantPanel,
  })),
);

function browseHrefFromState(state: unknown): string {
  const s = state as BrowseReturnState | null;
  const q = s?.browseSearch?.trim();
  if (q) return `${dualEntry.browse.path}?${q}`;
  return dualEntry.browse.path;
}

type TailPanel = 'none' | 'assistant' | 'graph' | 'comments';

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
          <h1 className="page-title" tabIndex={-1}>
            未找到
          </h1>
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
  const navigate = useNavigate();
  const likePath = `${dualEntry.browse.path}/${post.slug}`;
  const like = useLike(likePath);
  const feedback = useContentFeedback(post.slug);
  const neighbors = getSeriesNeighborsForSlug(post.slug);
  const related = getRelatedPosts(post.slug, [neighbors.prev?.slug, neighbors.next?.slug]);
  const [tailPanel, setTailPanel] = useState<TailPanel>('none');

  const graph = getKnowledgeGraph();
  const graphBodies = getGraphBodies();
  const graphNode = findGraphNode(graph, noteNodeId(post.slug));
  const hasBodyLinks = (graphNode?.linkDegree ?? 0) > 0;
  const hasComments = hasGiscusConfig();

  const graphDomain = useMemo(
    () => createContentGraphDomain({ browsePath: dualEntry.browse.path, bodies: graphBodies, navigate }),
    [graphBodies, navigate],
  );

  const { html, toc } = useMemo(() => {
    const markdown = expandWikiLinks(post.body, (slug) => {
      const target = getPostBySlug(slug);
      return target
        ? `${dualEntry.browse.path}/${encodeURIComponent(target.slug)}`
        : undefined;
    });
    const rawHtml = marked.parse(markdown, { async: false }) as string;
    const safe = sanitizeHtml(rawHtml);
    return buildArticleOutline(safe);
  }, [post.body]);

  const tocIds = useMemo(() => toc.map((t) => t.id), [toc]);
  const activeId = useTocActive(tocIds);
  const progress = useReadingProgress(true);

  const mins = estimateReadingMinutes(post.body);
  const statusLabel = post.status ? (STATUS_LABELS[post.status] ?? post.status) : '';
  const historyLabel = articleHistoryLabel(getArticleVersions(post.slug).length);

  const bodyRef = useRef<HTMLDivElement>(null);
  useCodeCopyButtons(bodyRef, html);

  const togglePanel = (target: Exclude<TailPanel, 'none'>) => {
    setTailPanel((current) => (current === target ? 'none' : target));
  };

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
          <h1 className="article-display-title" tabIndex={-1}>
            {post.title}
          </h1>
          <p className="meta article-meta">
            {formatDateLocale(parseIsoDate(post.date))}
            {` · 约 ${mins} 分钟`}
            {statusLabel ? ` · ${statusLabel}` : ''}
            {historyLabel ? (
              <>
                {' · '}
                <Link to={articleVersionListPath(post.slug)} className="article-history-badge">
                  {historyLabel}
                </Link>
              </>
            ) : null}
          </p>
          {post.summary ? <p className="article-summary">{post.summary}</p> : null}
        </header>

        <div className={`article-layout${toc.length ? ' has-toc' : ''}`}>
          {toc.length > 0 ? (
            <aside className="article-toc-aside" aria-label="目录">
              <ArticleToc items={toc} activeId={activeId} />
            </aside>
          ) : null}
          <div className="article-body">
            <div
              ref={bodyRef}
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
                  <span className="article-neighbor-title">{neighbors.prev.title}</span>
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
                  <span className="article-neighbor-title">{neighbors.next.title}</span>
                </span>
                <ChevronRight size={18} aria-hidden />
              </Link>
            ) : null}
          </nav>
        )}

        {post.resources?.length ? (
          <section className="article-footer-block" aria-label="项目入口">
            <h2>
              <ExternalLink size={16} aria-hidden />
              项目入口
            </h2>
            <ul>
              {post.resources.map((resource) => (
                <li key={`${resource.type}:${resource.url}`}>
                  <a href={resource.url} target="_blank" rel="noreferrer">
                    {resource.name}
                  </a>
                  {resource.description ? (
                    <span className="meta"> — {resource.description}</span>
                  ) : null}
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
                  <Link to={`${dualEntry.browse.path}/${encodeURIComponent(r.slug)}`}>
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="article-end">
          <div className="article-action-row">
            <LikeButton
              count={like.count}
              busy={like.busy}
              error={like.error}
              onLike={like.onLike}
            />
            <ArticleShare
              title={post.title}
              slug={post.slug}
              summary={post.summary}
            />
          </div>

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

          <div className="article-tail-pills" role="group" aria-label="延伸工具">
            <button
              type="button"
              className={`tail-pill${tailPanel === 'assistant' ? ' is-active' : ''}`}
              aria-expanded={tailPanel === 'assistant'}
              onClick={() => togglePanel('assistant')}
            >
              <MessageCircle size={14} aria-hidden />
              <span>问小影这篇</span>
            </button>
            {hasBodyLinks ? (
              <button
                type="button"
                className={`tail-pill${tailPanel === 'graph' ? ' is-active' : ''}`}
                aria-expanded={tailPanel === 'graph'}
                onClick={() => togglePanel('graph')}
              >
                <Network size={14} aria-hidden />
                <span>局部图谱</span>
              </button>
            ) : null}
            {hasComments ? (
              <button
                type="button"
                className={`tail-pill${tailPanel === 'comments' ? ' is-active' : ''}`}
                aria-expanded={tailPanel === 'comments'}
                onClick={() => togglePanel('comments')}
              >
                <MessageSquare size={14} aria-hidden />
                <span>评论</span>
              </button>
            ) : null}
          </div>
        </div>

        {tailPanel === 'assistant' ? (
          <Suspense fallback={<p className="meta">正在唤醒小影…</p>}>
            <ArticleAssistantPanel key={post.slug} slug={post.slug} title={post.title} />
          </Suspense>
        ) : null}

        {tailPanel === 'graph' && hasBodyLinks ? (
          <section className="article-footer-block article-graph-block" aria-label="局部图谱">
            <Suspense fallback={<p className="meta">正在载入图谱…</p>}>
              <KnowledgeGraph
                graph={graph}
                domain={graphDomain}
                local={{ centerId: noteNodeId(post.slug) }}
                height={360}
                compact
              />
            </Suspense>
            <p className="meta">
              <Link to={WEB_ROUTES.graph}>打开全站结构图谱</Link>
            </p>
          </section>
        ) : null}

        {tailPanel === 'comments' && hasComments ? <GiscusComments term={post.slug} /> : null}
      </article>
    </div>
  );
}
