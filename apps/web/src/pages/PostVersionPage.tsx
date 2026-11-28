/**
 * 历史版本详情（页）— /posts/:slug/v/:n
 *
 * 纪律：
 * - canonical 指向当前版（避免 N 个版本在搜索里互相打架）。
 * - 页面明示永久保留承诺。
 * - 数据只来自构建期投影（article-versions.json），无直连查询。
 */
import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { marked } from 'marked';
import {
  ARTICLE_VERSION_OUTDATED_NOTE,
  ARTICLE_VERSION_PERMANENCE_NOTE,
  articleCurrentPath,
  articleVersionListPath,
  expandWikiLinks,
  stripFrontmatterBlock,
} from '@walker/shared';
import { getPostBySlug } from '../content';
import { getArticleVersion, getArticleVersionCount } from '../article-versions';
import { sanitizeHtml } from '../lib/sanitize-html';
import { formatDateLocale, parseIsoDate } from '../shared/format';

export function PostVersionPage() {
  const { slug = '', version = '' } = useParams();
  const decodedSlug = decodeURIComponent(slug);
  const n = Number(version);
  const post = getPostBySlug(decodedSlug);
  const entry = Number.isInteger(n) && n >= 1 ? getArticleVersion(decodedSlug, n) : null;
  const total = getArticleVersionCount(decodedSlug);

  // 预渲染静态壳的 head 已带正确 canonical；只在它缺席时（dev SPA 直连）补一条，且先查重。
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
      <div className="measure page-head">
        <h1 className="page-title">版本不存在</h1>
        <p className="inline-actions">
          <Link to={articleCurrentPath(decodedSlug)}>回到当前版本</Link>
        </p>
      </div>
    );
  }

  return (
    <article className="measure article">
      <header className="article-head">
        <p className="kicker">
          <Link to={articleCurrentPath(decodedSlug)}>◂ 当前版本</Link>
          {' · '}v{entry.version} · {formatDateLocale(parseIsoDate(entry.publishedAt))}
        </p>
        <h1 className="article-title">{post.title}</h1>
        <p className="version-notice" role="note">
          {ARTICLE_VERSION_OUTDATED_NOTE}
        </p>
        <p className="article-dek">变更说明：{entry.note}</p>
      </header>

      <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />

      <footer className="article-end">
        <p className="meta">{ARTICLE_VERSION_PERMANENCE_NOTE}</p>
        <p className="inline-actions">
          {total > 0 ? <Link to={articleVersionListPath(decodedSlug)}>查看全部 {total} 个版本</Link> : null}
          <Link to={articleCurrentPath(decodedSlug)}>当前版本</Link>
        </p>
      </footer>
    </article>
  );
}
