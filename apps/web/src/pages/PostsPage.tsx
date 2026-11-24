/**
 * 文章总览（/posts）— 首屏直达年份时间线 + 单行子视图胶囊 + 折叠标签筛选。
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, Hash, SlidersHorizontal } from 'lucide-react';
import { getAllByHall, getBrowseItems } from '../content';
import { ItemList } from '../components/ItemList';
import { dualEntry } from '../shared/dual-entry';
import {
  filterTimelineItems,
  groupPostsByYear,
  listFrequentTags,
  tagFilterKey,
  type TimelineFilterKey,
} from '../shared/posts-timeline';
import { WEB_ROUTES } from '../shared/routes';

export function PostsPage() {
  const all = useMemo(() => getBrowseItems(), []);
  const labCount = useMemo(() => getAllByHall('lab').length, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tagFilter, setTagFilter] = useState<TimelineFilterKey>('all');
  const [tagsOpen, setTagsOpen] = useState(false);

  useEffect(() => {
    if (!searchParams.has('type')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('type');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const browseSearch = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('type');
    return next.toString();
  }, [searchParams]);

  const tags = useMemo(() => listFrequentTags(all), [all]);

  const visible = useMemo(
    () => filterTimelineItems(all, tagFilter),
    [all, tagFilter],
  );
  const byYear = useMemo(() => groupPostsByYear(visible), [visible]);

  const activeTagLabel =
    tagFilter !== 'all' && tagFilter.startsWith('tag:')
      ? tagFilter.slice(4)
      : null;

  const countLabel =
    tagFilter !== 'all' ? `${visible.length} / ${all.length}` : `${all.length}`;

  return (
    <div className="browse-page">
      <header className="browse-header">
        <div>
          <h1 className="browse-title">{dualEntry.browse.title}</h1>
          <p className="browse-lead meta">
            {countLabel} 篇{activeTagLabel ? ` · #${activeTagLabel}` : ''}
          </p>
        </div>

        <nav className="browse-pills" aria-label="文章子视图">
          <Link to={WEB_ROUTES.tutorials} className="browse-pill">
            教程
          </Link>
          <Link
            to={WEB_ROUTES.lab}
            className="browse-pill"
            aria-label={`进入札记，共 ${labCount} 篇`}
          >
            札记 <span className="browse-pill-count">{labCount}</span>
          </Link>
          <Link to={WEB_ROUTES.graph} className="browse-pill">
            图谱
          </Link>
        </nav>
      </header>

      {tags.length > 0 ? (
        <div className="browse-refine">
          <button
            type="button"
            className={`browse-refine-toggle${tagsOpen || activeTagLabel ? ' is-on' : ''}`}
            aria-expanded={tagsOpen}
            onClick={() => setTagsOpen((v) => !v)}
          >
            <SlidersHorizontal size={14} aria-hidden />
            筛选
            {activeTagLabel ? (
              <span className="browse-refine-active">#{activeTagLabel}</span>
            ) : null}
            <ChevronDown
              size={14}
              className={`browse-refine-chevron${tagsOpen ? ' is-open' : ''}`}
              aria-hidden
            />
          </button>

          {tagsOpen ? (
            <div className="browse-tag-panel" role="toolbar" aria-label="标签">
              <button
                type="button"
                className={`browse-tag${tagFilter === 'all' ? ' is-active' : ''}`}
                aria-pressed={tagFilter === 'all'}
                onClick={() => setTagFilter('all')}
              >
                全部
              </button>
              {tags.map((tag) => {
                const key = tagFilterKey(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`browse-tag${tagFilter === key ? ' is-active' : ''}`}
                    aria-pressed={tagFilter === key}
                    onClick={() => setTagFilter(key)}
                  >
                    <Hash size={11} aria-hidden />
                    {tag}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {byYear.length === 0 ? (
        <p className="browse-empty meta">当前筛选下没有内容。</p>
      ) : (
        byYear.map(({ year, items }) => (
          <section key={year || 'unknown'} className="browse-year">
            <div className="browse-year-head">
              <h2 className="browse-year-title">
                {year > 0 ? year : '未标注年份'}
              </h2>
              <span className="meta">{items.length}</span>
            </div>
            <div className="browse-list-card surface-l1">
              <ItemList
                items={items}
                editorial
                browseSearch={browseSearch}
              />
            </div>
          </section>
        ))
      )}
    </div>
  );
}
