/**
 * SeriesPartMenu — 文章阅读页顶栏系列章节切换器（第 N/M 篇 ▾）
 * 职责：当文章属于某系列（>= 2 篇）时，仅在阅读页按需展现章节下拉导航，彻底解放首页分类。
 */
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { getPostsBySeries } from '../../content';
import { dualEntry } from '../../shared/dual-entry';

interface Props {
  series?: string;
  currentSlug: string;
}

export function SeriesPartMenu({ series, currentSlug }: Props) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const name = series?.trim();
  if (!name) return <span className="reading-chrome-spacer" aria-hidden />;

  const items = getPostsBySeries(name);
  if (items.length < 2) {
    return <span className="reading-chrome-spacer" aria-hidden />;
  }

  const index = items.findIndex((item) => item.slug === currentSlug);
  const partLabel = index >= 0 ? `第 ${index + 1}/${items.length} 篇` : `${items.length} 篇`;

  return (
    <details ref={detailsRef} className="series-part-menu">
      <summary className="series-part-trigger">
        <span>{partLabel}</span>
        <ChevronDown size={14} aria-hidden />
      </summary>
      <div className="series-part-popover surface-l2">
        <div className="series-part-head">{name}</div>
        <ul className="series-part-list">
          {items.map((item, idx) => {
            const active = item.slug === currentSlug;
            return (
              <li key={item.slug}>
                <Link
                  to={`${dualEntry.browse.path}/${encodeURIComponent(item.slug)}`}
                  className={`series-part-item${active ? ' is-current' : ''}`}
                  onClick={() => {
                    if (detailsRef.current) detailsRef.current.open = false;
                  }}
                >
                  <span className="series-part-num">{idx + 1}.</span>
                  <span>{item.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
