/**
 * 历史版本详情（页）— /posts/:slug/v/:n
 *
 * 纪律：
 * - canonical 指向当前版（避免 N 个版本在搜索里互相打架）。
 * - 页面明示永久保留承诺（准出第 8 条）。
 * - 数据只来自构建期投影（article-versions.json），无直连查询。
 */
import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, History } from 'lucide-react';
import { marked } from 'marked';
import {
  ARTICLE_VERSION_OUTDATED_NOTE,
  ARTICLE_VERSION_PERMANENCE_NOTE,
  articleCurrentPath,
  articleVersionListPath,
} from '@walker/shared';
import { expandWikiLinks, stripFrontmatterBlock } from '@walker/shared';
import { getPostBySlug } from '../content';
import { getArticleVersion, getArticleVersionCount } from '../article-versions';
import { sanitizeHtml } from '../lib/sanitize-html';
import { formatDateLocale, parseIsoDate } from '../shared/format';

// blob 正文 = 原始 md（含 frontmatter）；展示前剥掉头（stripFrontmatterBlock 单点在 shared）

export function PostVersionPage() {
  const { slug = '', version = '' } = useParams();
  const decodedSlug = decodeURIComponent(slug);
  const n = Number(version);
  const post = getPostBySlug(decodedSlug);
  const entry = Number.isInteger(n) && n >= 1 ? getArticleVersion(decodedSlug, n) : null;
  const total = getArticleVersionCount(decodedSlug);

  // canonical → 当前版（规则③）。预渲染静态壳的 head 已带正确 canonical；
  // 这里只在它缺席时（dev SPA 直连场景）补一条，且先查重，绝不制造双 canonical。
  useEffect(() => {
    if (document.head.querySelector('link[rel="canonical"]')) return;
    const link = document.createElement('link');
    link.rel = 'canonical';
    link.href = articleCurrentPath(decodedSlug);
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, [decodedSlug]);

  const html = useMemo(() => {
    if (!entry) return '';
    const markdown = expandWikiLinks(stripFrontmatterBlock(entry.body), (target) => {
      const hit = getPostBySlug(target);
      return hit ? articleCurrentPath(hit.slug) : undefined;
    });
    return sanitizeHtml(marked.parse(markdown, { async: false }) as string);
  }, [entry]);

  if (!post || !entry) {
    return (
      <div className="reading-stage">
        <article className="reading-column article-shell">
          <header className="article-header">
            <h1 className="article-display-title">版本不存在</h1>
            <p className="meta article-meta">
              <Link to={articleCurrentPath(decodedSlug)}>回到当前版本</Link>
            </p>
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
          aria-label="回到当前版本"
        >
          <ArrowLeft size={18} aria-hidden />
          <span>当前版本</span>
        </Link>
        <span className="reading-chrome-title" title={post.title}>
          {post.title} · v{entry.version}
        </span>
        <span className="reading-chrome-spacer" aria-hidden />
      </header>

      <article className="reading-column article-shell reading-enter">
        <header className="article-header">
          <h1 className="article-display-title">{post.title}</h1>
          <p className="meta article-meta">
            版本 v{entry.version} · 发布于 {formatDateLocale(parseIsoDate(entry.publishedAt))}
          </p>
          <p className="article-version-notice" role="note">
            <History size={14} aria-hidden /> {ARTICLE_VERSION_OUTDATED_NOTE}
          </p>
          <p className="article-version-note">变更说明：{entry.note}</p>
        </header>

        <div className="article-body">
          <div className="prose-md" dangerouslySetInnerHTML={{ __html: html }} />
        </div>

        <footer className="article-version-footer">
          <p className="article-version-permanence">{ARTICLE_VERSION_PERMANENCE_NOTE}</p>
          <p className="meta">
            {total > 0 ? (
              <Link to={articleVersionListPath(decodedSlug)}>查看全部 {total} 个版本</Link>
            ) : null}
            {' · '}
            <Link to={articleCurrentPath(decodedSlug)}>当前版本</Link>
          </p>
        </footer>
      </article>
    </div>
  );
}
