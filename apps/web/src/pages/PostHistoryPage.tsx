/**
 * 版本历史列表（页）— /posts/:slug/history
 * 倒序列出版本号 / 发布时间 / 变更说明，不带正文。
 */
import { Link, useParams } from 'react-router-dom';
import { articleCurrentPath, articleHistorySummary, articleVersionPath } from '@walker/shared';
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
      <div className="measure page-head">
        <h1 className="page-title">文章不存在</h1>
      </div>
    );
  }

  return (
    <div className="measure">
      <header className="page-head">
        <p className="kicker">
          <Link to={articleCurrentPath(decodedSlug)}>◂ {post.title}</Link>
        </p>
        <h1 className="page-title">版本历史</h1>
        <p className="page-dek">
          {versions.length > 1
            ? articleHistorySummary({
                count: versions.length,
                firstPublishedAt: versions[0]!.publishedAt,
                latestPublishedAt: versions[versions.length - 1]!.publishedAt,
              })
            : versions.length === 1
              ? '本文只有一个公开版本——首版就是当前版，没有更早的内容可看。'
              : '本文还没有公开的版本历史。'}
        </p>
      </header>

      <ol className="entry-list version-list" reversed>
        {[...versions].reverse().map((v) => (
          <li key={v.version}>
            <Link to={articleVersionPath(decodedSlug, v.version)} className="entry">
              <span className="entry-title">v{v.version}</span>
              <span className="entry-meta">{formatDateLocale(parseIsoDate(v.publishedAt))}</span>
              <span className="entry-dek">{v.note}</span>
            </Link>
          </li>
        ))}
      </ol>

      <p className="inline-actions">
        <Link to={articleCurrentPath(decodedSlug)}>回到当前版本</Link>
      </p>
    </div>
  );
}
