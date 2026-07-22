/**
 * 点子桌（页）
 * 职责：卡牌 + 状态筛选；状态规则在 idea-status。
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import { getByType } from '../content';
import { ContentCard } from '../components/ContentCard';
import { STATUS_LABELS } from '../shared/constants';
import { dualEntry } from '../shared/dual-entry';
import {
  IDEA_STATUS_FILTERS,
  isThinkingStatus,
  matchesIdeaFilter,
  type IdeaStatusFilter,
} from '../shared/idea-status';

export function IdeasPage() {
  const ideas = useMemo(() => getByType('idea'), []);
  const [filter, setFilter] = useState<IdeaStatusFilter>('all');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const filtered = ideas.filter((i) => matchesIdeaFilter(i.status, filter));

  return (
    <div className="ideas-page">
      <header className="ideas-intro panel-glass">
        <div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            <Lightbulb
              size={22}
              className="page-title-icon"
              aria-hidden
            />
            点子
          </h1>
          <p className="page-lead" style={{ margin: 0 }}>
            点子是不分时空的资产。共 {ideas.length} 条 · 当前显示 {filtered.length}{' '}
            条。详情仍在「逛」阅读。
          </p>
        </div>
        <Link to={dualEntry.browse.path} className="btn-secondary">
          去逛全部
        </Link>
      </header>

      <div className="filter-tabs" role="tablist" aria-label="点子状态">
        {IDEA_STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`filter-tab${filter === f.id ? ' is-active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <span className="filter-count">
              {ideas.filter((i) => matchesIdeaFilter(i.status, f.id)).length}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="meta panel-glass" style={{ padding: '1.25rem' }}>
          这个状态下还没有点子。
        </p>
      ) : (
        <div className="ideas-tabletop">
          <div className="content-card-grid">
            {filtered.map((item) => {
              const blurred =
                isThinkingStatus(item.status) && !revealed[item.slug];
              return (
                <ContentCard
                  key={item.slug}
                  item={item}
                  blurred={blurred}
                  onReveal={
                    blurred
                      ? () =>
                          setRevealed((prev) => ({
                            ...prev,
                            [item.slug]: true,
                          }))
                      : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      <p className="meta" style={{ marginTop: '1.25rem' }}>
        状态：
        {Object.entries(STATUS_LABELS)
          .map(([k, v]) => `${v}(${k})`)
          .join(' · ')}
      </p>
    </div>
  );
}
