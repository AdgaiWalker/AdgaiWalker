/**
 * 逛列表（页）
 * 职责：主题线 + 标签 + 年份时间线；规则在 posts-timeline。
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Hash, Layers, LayoutGrid } from 'lucide-react';
import { getPublishedPosts, listSeries } from '../content';
import { ItemList } from '../components/ItemList';
import { dualEntry } from '../shared/dual-entry';
import {
  filterTimelineItems,
  groupPostsByYear,
  listFrequentTags,
  tagFilterKey,
  type TimelineFilterKey,
} from '../shared/posts-timeline';

export function PostsPage() {
  const all = getPublishedPosts();
  const seriesNames = listSeries();
  const tags = useMemo(() => listFrequentTags(all), [all]);
  const [filter, setFilter] = useState<TimelineFilterKey>('all');

  const visible = useMemo(
    () => filterTimelineItems(all, filter),
    [all, filter],
  );
  const byYear = useMemo(() => groupPostsByYear(visible), [visible]);

  return (
    <div className="timeline-shell">
      <h1 className="page-title">{dualEntry.browse.title}</h1>
      <p className="page-lead">
        共 {all.length} 篇已发布
        {filter !== 'all' ? ` · 当前 ${visible.length} 篇` : ''}
        。卡住时也可{' '}
        <Link to={dualEntry.ask.path}>{dualEntry.ask.cta}</Link>。
      </p>

      <div className="panel-glass posts-quote">
        <Compass size={18} className="posts-quote-icon" aria-hidden />
        <div>
          <p className="posts-quote-text">
            读证据、看交付，再决定要不要带着问题来卡。
          </p>
          <p className="meta">逛 · 主题线与标签</p>
        </div>
      </div>

      <div className="filter-tabs" role="toolbar" aria-label="按主题线筛选">
        <button
          type="button"
          className={`filter-tab${filter === 'all' ? ' is-active' : ''}`}
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          <LayoutGrid size={14} aria-hidden />
          全部
          <span className="filter-count">{all.length}</span>
        </button>
        {seriesNames.map((name) => (
          <button
            key={name}
            type="button"
            className={`filter-tab${filter === name ? ' is-active' : ''}`}
            aria-pressed={filter === name}
            onClick={() => setFilter(name)}
          >
            <Layers size={14} aria-hidden />
            {name}
            <span className="filter-count">
              {filterTimelineItems(all, name).length}
            </span>
          </button>
        ))}
        <button
          type="button"
          className={`filter-tab${filter === 'other' ? ' is-active' : ''}`}
          aria-pressed={filter === 'other'}
          onClick={() => setFilter('other')}
        >
          其他
          <span className="filter-count">
            {filterTimelineItems(all, 'other').length}
          </span>
        </button>
      </div>

      {tags.length > 0 ? (
        <div className="filter-tabs" role="toolbar" aria-label="按标签筛选">
          {tags.map((tag) => {
            const key = tagFilterKey(tag);
            return (
              <button
                key={tag}
                type="button"
                className={`filter-tab${filter === key ? ' is-active' : ''}`}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                <Hash size={14} aria-hidden />
                {tag}
                <span className="filter-count">
                  {filterTimelineItems(all, key).length}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {byYear.length === 0 ? (
        <p className="meta panel-glass" style={{ padding: '1.25rem' }}>
          当前筛选下没有文章。
        </p>
      ) : (
        byYear.map(({ year, items }) => (
          <section key={year || 'unknown'} className="year-group">
            <div className="year-group-head">
              <h2 className="year-group-title">
                {year > 0 ? year : '未标注年份'}
              </h2>
              <span className="meta">{items.length} 篇</span>
            </div>
            <div className="panel-glass year-group-body">
              <ItemList items={items} />
            </div>
          </section>
        ))
      )}
    </div>
  );
}
