/**
 * 逛列表 — 按主题线（series）筛选已发布笔记。
 * 依赖：content 查询门面、ItemList；筛选键来自 listSeries() 数据，无硬编码线名。
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, Layers } from 'lucide-react';
import {
  getPostsBySeries,
  getPostsWithoutSeries,
  getPublishedPosts,
  listSeries,
} from '../content';
import { ItemList } from '../components/ItemList';
import { dualEntry } from '../shared/dual-entry';

type FilterKey = 'all' | 'other' | string;

export function PostsPage() {
  const all = getPublishedPosts();
  const seriesNames = listSeries();
  const [filter, setFilter] = useState<FilterKey>('all');

  const visible = useMemo(() => {
    if (filter === 'all') return all;
    if (filter === 'other') return getPostsWithoutSeries();
    return getPostsBySeries(filter);
  }, [all, filter]);

  return (
    <div>
      <h1 className="page-title">{dualEntry.browse.title}</h1>
      <p className="page-lead">
        共 {all.length} 篇已发布笔记
        {filter !== 'all' ? ` · 当前 ${visible.length} 篇` : ''}
        。卡住时也可直接{' '}
        <Link to={dualEntry.ask.path}>{dualEntry.ask.cta}</Link>。
      </p>

      <div
        className="series-filter"
        role="toolbar"
        aria-label="按主题线筛选"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '1rem',
        }}
      >
        <FilterChip
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          icon={<LayoutGrid size={14} aria-hidden />}
          label="全部"
        />
        {seriesNames.map((name) => (
          <FilterChip
            key={name}
            active={filter === name}
            onClick={() => setFilter(name)}
            icon={<Layers size={14} aria-hidden />}
            label={name}
          />
        ))}
        <FilterChip
          active={filter === 'other'}
          onClick={() => setFilter('other')}
          label="其他"
        />
      </div>

      <div className="surface-l2" style={{ padding: '0.5rem 1.25rem' }}>
        <ItemList items={visible} />
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '0.35rem 0.75rem',
        borderRadius: 999,
        border: active
          ? '1px solid var(--color-accent, #2d6a4f)'
          : '1px solid var(--color-border, #ccc)',
        background: active
          ? 'var(--color-accent-soft, rgba(45,106,79,0.12))'
          : 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        fontSize: '0.875rem',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
