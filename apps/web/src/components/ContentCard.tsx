/**
 * ContentCard — 探索与专题卡片；构思中仅轻柔雾感提示，悬停/聚焦即散开，1 步点击直达。
 */
import { Link } from 'react-router-dom';
import type { ContentItem } from '../content';
import { STATUS_LABELS } from '../shared/constants';
import { dualEntry } from '../shared/dual-entry';
import { formatDateCompact, parseIsoDate } from '../shared/format';
import { spaceForType } from '../shared/content-spaces';
import { spaceIcon } from '../shared/space-icons';

export function ContentCard({
  item,
  detailBase = dualEntry.browse.path,
  blurred = false,
  onReveal,
}: {
  item: ContentItem;
  detailBase?: string;
  blurred?: boolean;
  onReveal?: () => void;
}) {
  const statusLabel = item.status ? (STATUS_LABELS[item.status] ?? item.status) : '';
  const space = spaceForType(item.type);
  const Icon = spaceIcon(space.icon);
  const href = `${detailBase}/${encodeURIComponent(item.slug)}`;

  return (
    <article
      className={`content-card${blurred ? ' is-hazy' : ''}`}
      style={{ ['--space-color' as string]: space.color }}
      onMouseEnter={() => onReveal?.()}
      onFocus={() => onReveal?.()}
    >
      <div className="content-card-inner">
        <div className="content-card-body">
          <div className="content-card-meta">
            <Icon size={14} className="content-card-type-icon" aria-hidden />
            <span className="meta">{formatDateCompact(parseIsoDate(item.date))}</span>
            <span className="content-card-space">{space.label}</span>
            {statusLabel ? <span className="status-pill">{statusLabel}</span> : null}
          </div>
          <h3 className="content-card-title">
            <Link to={href}>{item.title}</Link>
          </h3>
          {item.summary ? (
            <p className="content-card-summary">{item.summary}</p>
          ) : null}
          {item.tags.length ? (
            <div className="content-card-tags">
              {item.tags.slice(0, 4).map((t) => (
                <span key={t} className="content-card-tag">
                  #{t}
                </span>
              ))}
            </div>
          ) : null}
          <Link to={href} className="content-card-more">
            阅读
          </Link>
        </div>
      </div>
    </article>
  );
}
