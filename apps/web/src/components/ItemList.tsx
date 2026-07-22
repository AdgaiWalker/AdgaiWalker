/**
 * 内容列表（块）
 * 职责：流式列表展示；无 emoji、无业务写路径。
 */
import { Link } from 'react-router-dom';
import type { ContentItem } from '../content';
import { STATUS_LABELS } from '../shared/constants';
import { dualEntry } from '../shared/dual-entry';
import { formatDateLocale, parseIsoDate } from '../shared/format';
import { estimateReadingMinutes } from '../shared/reading';
import { spaceForType } from '../shared/content-spaces';
import { spaceIcon } from '../shared/space-icons';

export function ItemList({
  items,
  detailBase = dualEntry.browse.path,
}: {
  items: ContentItem[];
  detailBase?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="meta" style={{ padding: '1rem 0' }}>
        暂无内容
      </p>
    );
  }
  return (
    <ul className="post-list">
      {items.map((p) => {
        const statusLabel = p.status ? STATUS_LABELS[p.status] ?? p.status : '';
        const mins = estimateReadingMinutes(p.body || p.summary || p.title);
        const space = spaceForType(p.type);
        const Icon = spaceIcon(space.icon);
        return (
          <li key={p.slug}>
            <div className="post-list-row">
              <Icon size={15} className="post-list-icon" aria-hidden />
              <div className="post-list-main">
                <Link to={`${detailBase}/${encodeURIComponent(p.slug)}`}>
                  {p.title}
                </Link>
                {statusLabel ? (
                  <span className="status-pill">{statusLabel}</span>
                ) : null}
                <div className="meta">
                  {formatDateLocale(parseIsoDate(p.date))} · {space.label}
                  {p.series ? ` · ${p.series}` : ''}
                  {p.level ? ` · ${p.level}` : ''}
                  {` · 约 ${mins} 分钟`}
                  {p.tags.length ? ` · ${p.tags.slice(0, 3).join(', ')}` : ''}
                </div>
                {p.summary ? (
                  <p className="meta" style={{ marginTop: 4 }}>
                    {p.summary}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
