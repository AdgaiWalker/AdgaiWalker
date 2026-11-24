/**
 * 内容列表（块）
 * 职责：整行可点；compact 扫读；带 View Transitions 与 browse 回程 state。
 */
import { Link, useNavigate } from 'react-router-dom';
import type { ContentItem } from '../content';
import { navigateWithViewTransition } from '../lib/view-transition';
import { STATUS_LABELS } from '../shared/constants';
import { dualEntry } from '../shared/dual-entry';
import { formatDateLocale, parseIsoDate } from '../shared/format';
import { estimateReadingMinutes } from '../shared/reading';
import { spaceForType } from '../shared/content-spaces';
import { spaceIcon } from '../shared/space-icons';

/** 读页返回逛时恢复筛选（location.state） */
export type BrowseReturnState = {
  browseSearch?: string;
};

export function ItemList({
  items,
  detailBase = dualEntry.browse.path,
  compact = false,
  editorial = false,
  /** 当前逛页 query（不含 ?），写入详情 state */
  browseSearch = '',
}: {
  items: ContentItem[];
  detailBase?: string;
  compact?: boolean;
  /** 编辑式内容流：只展示文章本身，隐藏内部分类与状态。 */
  editorial?: boolean;
  browseSearch?: string;
}) {
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <p className="meta" style={{ padding: '1rem 1.15rem' }}>
        暂无内容
      </p>
    );
  }

  const returnState: BrowseReturnState | undefined = browseSearch
    ? { browseSearch }
    : undefined;

  return (
    <ul
      className={`post-list${compact ? ' is-compact' : ''}${editorial ? ' is-editorial' : ''}`}
    >
      {items.map((p) => {
        const statusLabel = p.status ? STATUS_LABELS[p.status] ?? p.status : '';
        const mins = estimateReadingMinutes(p.body || p.summary || p.title);
        const space = spaceForType(p.type);
        const Icon = spaceIcon(space.icon);
        const href = `${detailBase}/${encodeURIComponent(p.slug)}`;
        return (
          <li key={p.slug} className="post-list-item">
            <Link
              to={href}
              state={returnState}
              className="post-list-hit"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                const titleEl = e.currentTarget.querySelector<HTMLElement>('.post-list-title');
                navigateWithViewTransition(navigate, href, {
                  state: returnState,
                  sourceElement: titleEl,
                });
              }}
            >
              {!editorial ? (
                <Icon size={15} className="post-list-icon" aria-hidden />
              ) : null}
              <div className="post-list-main">
                <div className="post-list-title-row">
                  <span className="post-list-title">{p.title}</span>
                  {!editorial && statusLabel ? (
                    <span className="status-pill">{statusLabel}</span>
                  ) : null}
                </div>
                <div className="post-list-meta meta">
                  {formatDateLocale(parseIsoDate(p.date))}
                  {!editorial ? ` · ${space.label}` : ''}
                  {` · ${mins} 分钟`}
                </div>
                {(!compact || editorial) && p.summary ? (
                  <p className="post-list-summary">{p.summary}</p>
                ) : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
