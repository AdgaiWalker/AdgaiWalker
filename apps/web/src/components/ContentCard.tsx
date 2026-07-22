/**
 * 内容卡牌（块）
 * 职责：展示单条内容元数据与链接；不读全局、不 fetch。
 * 依赖：content-spaces 配置、space-icons 展示映射。
 */
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
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
  const statusLabel = item.status
    ? (STATUS_LABELS[item.status] ?? item.status)
    : '';
  const space = spaceForType(item.type);
  const Icon = spaceIcon(space.icon);
  const href = `${detailBase}/${encodeURIComponent(item.slug)}`;

  return (
    <article
      className={`content-card${blurred ? ' is-blurred' : ''}`}
      style={{ ['--space-color' as string]: space.color }}
    >
      <div className="content-card-inner">
        {blurred ? (
          <div className="content-card-lock">
            <Lock size={22} aria-hidden />
            <span className="content-card-lock-title">构思中</span>
            <p className="meta">点子还在酝酿，点开可先看标题与摘要</p>
            {onReveal ? (
              <button type="button" className="btn-secondary" onClick={onReveal}>
                翻开
              </button>
            ) : (
              <Link to={href} className="btn-secondary">
                翻开
              </Link>
            )}
          </div>
        ) : null}
        <div className="content-card-body">
          <div className="content-card-meta">
            <Icon size={14} className="content-card-type-icon" aria-hidden />
            <span className="meta">{formatDateCompact(parseIsoDate(item.date))}</span>
            <span className="content-card-space">{space.label}</span>
            {statusLabel ? (
              <span className="status-pill">{statusLabel}</span>
            ) : null}
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
