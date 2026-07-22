/**
 * 内容宇宙（页）
 * 职责：分型 + 流/网格；数据用 getPublishedContentItems（含 tool）。
 *
 * 依赖：content 门面、content-spaces、块
 * 调用：无 HTTP
 * 触发：/content
 * 实现：空间筛选 → 流式或网格
 */
import { useMemo, useState } from 'react';
import { getPublishedContentItems } from '../content';
import { ContentCard } from '../components/ContentCard';
import { ItemList } from '../components/ItemList';
import {
  CONTENT_SPACES,
  filterBySpace,
  type ContentSpaceId,
} from '../shared/content-spaces';
import { spaceIcon } from '../shared/space-icons';

type ViewMode = 'stream' | 'grid';

export function ContentUniversePage() {
  const all = useMemo(() => getPublishedContentItems(), []);
  const [space, setSpace] = useState<ContentSpaceId>('all');
  const [view, setView] = useState<ViewMode>('stream');

  const active = CONTENT_SPACES.find((s) => s.id === space) ?? CONTENT_SPACES[0];
  const filtered = useMemo(
    () => filterBySpace(all, space) as typeof all,
    [all, space],
  );

  return (
    <div className="stream-shell">
      <header className="stream-hero">
        <p className="stream-kicker">内容宇宙</p>
        <h1 className="stream-tagline">
          点子是<em>驱动力</em>，生活是<em>土壤</em>。
        </h1>
        <p className="stream-count">
          持续更新 · <strong>{filtered.length}</strong>
          {space === 'all' ? ` / ${all.length}` : ''} 篇
        </p>
      </header>

      <div className="view-toolbar">
        <div className="filter-tabs" role="tablist" aria-label="内容空间">
          {CONTENT_SPACES.map((s) => {
            const count = filterBySpace(all, s.id).length;
            const Icon = spaceIcon(s.icon);
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={space === s.id}
                className={`filter-tab${space === s.id ? ' is-active' : ''}`}
                onClick={() => setSpace(s.id)}
                style={{ ['--tab-color' as string]: s.color }}
              >
                <Icon size={14} aria-hidden />
                {s.label}
                <span className="filter-count">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="view-switcher" role="group" aria-label="视图切换">
          <button
            type="button"
            className={`view-btn${view === 'stream' ? ' is-active' : ''}`}
            aria-pressed={view === 'stream'}
            onClick={() => setView('stream')}
          >
            流式
          </button>
          <button
            type="button"
            className={`view-btn${view === 'grid' ? ' is-active' : ''}`}
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
          >
            网格
          </button>
        </div>
      </div>

      <p className="meta stream-space-note" aria-live="polite">
        {active.hint}
      </p>

      {filtered.length === 0 ? (
        <p className="meta panel-glass" style={{ padding: '1.25rem' }}>
          这个空间暂时还没有公开内容。
        </p>
      ) : view === 'stream' ? (
        <div
          className="panel-glass"
          style={{ padding: '0.5rem 1.25rem', borderRadius: 24 }}
        >
          <ItemList items={filtered} />
        </div>
      ) : (
        <div className="content-card-grid">
          {filtered.map((item) => (
            <ContentCard key={item.slug} item={item} />
          ))}
        </div>
      )}

      <footer className="stream-legend" aria-label="空间配色">
        {CONTENT_SPACES.filter((s) => s.id !== 'all').map((s) => {
          const Icon = spaceIcon(s.icon);
          return (
            <span key={s.id} className="legend-item">
              <Icon size={12} aria-hidden style={{ color: s.color }} />
              {s.label}
            </span>
          );
        })}
      </footer>
    </div>
  );
}
