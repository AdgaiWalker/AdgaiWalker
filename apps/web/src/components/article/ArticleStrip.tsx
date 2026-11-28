/**
 * ArticleStrip — 文章页吸顶细条：◂ 文章 · 滚过标题后浮出标题 · 系列第 N/M 篇 · 2px 阅读进度线。
 * 进度线优先用 CSS scroll-driven animation（零 JS 监听），不支持时退回 useReadingProgress。
 */
import { useEffect, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useReadingProgress } from '../../hooks/useReadingProgress';
import { SeriesPartMenu } from '../ui/SeriesPartMenu';

type Props = {
  title: string;
  slug: string;
  series?: string;
  backHref: string;
  backLabel: string;
  titleRef: RefObject<HTMLElement | null>;
};

export function ArticleStrip({ title, slug, series, backHref, backLabel, titleRef }: Props) {
  const progress = useReadingProgress(true);
  const [past, setPast] = useState(false);

  useEffect(() => {
    const node = titleRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setPast(!entry!.isIntersecting && entry!.boundingClientRect.top < 0));
    io.observe(node);
    return () => io.disconnect();
  }, [titleRef]);

  return (
    <div className={`article-strip${past ? ' is-past' : ''}`}>
      <div className="wrap article-strip-row">
        <Link to={backHref} className="article-strip-back">
          ◂ {backLabel}
        </Link>
        <span className="article-strip-title" aria-hidden={!past}>
          {title}
        </span>
        <SeriesPartMenu series={series} currentSlug={slug} />
      </div>
      <span className="article-strip-progress" style={{ ['--progress' as string]: progress }} aria-hidden />
    </div>
  );
}
