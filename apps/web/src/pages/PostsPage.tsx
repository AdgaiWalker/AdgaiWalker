/**
 * 逛列表（页）— 公开证据唯一总览
 * 职责：类型分段 + 可折叠标签 + 年份列表；默认安静可扫。
 *
 * 依赖：content.getBrowseItems、posts-timeline、BROWSE_SPACES
 * 触发：dualEntry.browse.path；?type= 深链
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, Hash, SlidersHorizontal } from 'lucide-react';
import { getBrowseItems } from '../content';
import { ItemList } from '../components/ItemList';
import {
  BROWSE_SPACES,
  type ContentSpaceId,
} from '../shared/content-spaces';
import { dualEntry } from '../shared/dual-entry';
import {
  filterTimelineItems,
  groupPostsByYear,
  listFrequentTags,
  tagFilterKey,
  typeFilterKey,
  type TimelineFilterKey,
} from '../shared/posts-timeline';

function parseTypeParam(raw: string | null): ContentSpaceId {
  if (!raw) return 'all';
  const hit = BROWSE_SPACES.find((s) => s.id === raw);
  return hit ? hit.id : 'all';
}

export function PostsPage() {
  const all = useMemo(() => getBrowseItems(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const typeParam = searchParams.get('type');
  const space = parseTypeParam(typeParam);
  const [tagFilter, setTagFilter] = useState<TimelineFilterKey>('all');
  const [tagsOpen, setTagsOpen] = useState(false);

  /* 侧栏深链改 type 时清标签 */
  useEffect(() => {
    setTagFilter('all');
    setTagsOpen(false);
  }, [typeParam]);

  const bySpace = useMemo(() => {
    if (space === 'all') return all;
    return filterTimelineItems(all, typeFilterKey(space));
  }, [all, space]);

  const tags = useMemo(() => listFrequentTags(bySpace), [bySpace]);

  const visible = useMemo(
    () => filterTimelineItems(bySpace, tagFilter),
    [bySpace, tagFilter],
  );
  const byYear = useMemo(() => groupPostsByYear(visible), [visible]);

  const activeTagLabel =
    tagFilter !== 'all' && tagFilter.startsWith('tag:')
      ? tagFilter.slice(4)
      : null;

  function selectSpace(id: ContentSpaceId) {
    setTagFilter('all');
    setTagsOpen(false);
    if (id === 'all') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ type: id }, { replace: true });
    }
  }

  const countLabel =
    space !== 'all' || tagFilter !== 'all'
      ? `${visible.length} / ${all.length}`
      : `${all.length}`;

  return (
    <div className="browse-page">
      <header className="browse-header">
        <h1 className="browse-title">{dualEntry.browse.title}</h1>
        <p className="browse-lead meta">
          {countLabel} 篇
          {activeTagLabel ? ` · #${activeTagLabel}` : ''}
        </p>
      </header>

      {/* 一级：类型分段（唯一 sticky chrome） */}
      <div
        className="browse-segment surface-chrome"
        role="tablist"
        aria-label="类型"
      >
        {BROWSE_SPACES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={space === s.id}
            className={`browse-seg${space === s.id ? ' is-active' : ''}`}
            onClick={() => selectSpace(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 二级：标签默认折叠 */}
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
            <div className="browse-list-card surface-l2">
              <ItemList
                items={items}
                compact
                browseSearch={searchParams.toString()}
              />
            </div>
          </section>
        ))
      )}
    </div>
  );
}
