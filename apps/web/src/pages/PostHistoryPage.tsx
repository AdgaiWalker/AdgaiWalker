/**
 * 版本历史列表（页）— /posts/:slug/history
 * 倒序列出版本号 / 发布时间 / 变更说明，不带正文（界面闭环第一步）。
 */
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, History } from 'lucide-react';
import {
  articleCurrentPath,
  articleHistorySummary,
  articleVersionPath,
} from '@walker/shared';
import { getPostBySlug } from '../content';
import { getArticleVersions } from '../article-versions';
import { formatDateLocale, parseIsoDate } from '../shared/format';

export function PostHistoryPage() {
  const { slug = '' } = useParams();
  const decodedSlug = decodeURIComponent(slug);
  const post = getPostBySlug(decodedSlug);
  const versions = getArticleVersions(decodedSlug);

  if (!post) {
    return (
      <div className="reading-stage">
        <article className="reading-column article-shell">
          <header className="article-header">
            <h1 className="article-display-title">文章不存在</h1>
          </header>
        </article>
      </div>
    );
  }

  return (
    <div className="reading-stage">
      <header className="reading-chrome surface-chrome">
        <Link
          to={articleCurrentPath(decodedSlug)}
          className="reading-chrome-back"
          aria-label="回到文章"
        >
          <ArrowLeft size={18} aria-hidden />
          <span>文章</span>
        </Link>
        <span className="reading-chrome-title" title={post.title}>
          {post.title} · 版本历史
        </span>
        <span className="reading-chrome-spacer" aria-hidden />
      </header>

      <article className="reading-column article-shell reading-enter">
        <header className="article-header">
          <h1 className="article-display-title">
            <History size={22} aria-hidden /> 版本历史
          </h1>
          {versions.length > 1 ? (
            <p className="meta article-meta">
              {articleHistorySummary({
                count: versions.length,
                firstPublishedAt: versions[0]!.publishedAt,
                latestPublishedAt: versions[versions.length - 1]!.publishedAt,
              })}
            </p>
          ) : versions.length === 1 ? (
            <p className="meta article-meta">
              本文只有一个公开版本——首版就是当前版，没有更早的内容可看。
            </p>
          ) : (
            <p className="meta article-meta">本文还没有公开的版本历史。</p>
          )}
        </header>

        <ol className="article-history-list" reversed>
          {[...versions].reverse().map((v) => (
            <li key={v.version} className="article-history-item">
              <Link to={articleVersionPath(decodedSlug, v.version)}>
                <strong>v{v.version}</strong>
              </Link>
              <span className="meta"> · {formatDateLocale(parseIsoDate(v.publishedAt))}</span>
              <p className="article-history-note">{v.note}</p>
            </li>
          ))}
        </ol>

        <footer className="article-version-footer">
          <p className="meta">
            <Link to={articleCurrentPath(decodedSlug)}>回到当前版本</Link>
          </p>
        </footer>
      </article>
    </div>
  );
}
