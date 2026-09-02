/**
 * 探索（页）— 实验中向外做事的统一入口。
 * 点子 / 项目由明确归属决定，状态只描述各自的推进程度。
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Compass, Ship } from 'lucide-react';
import { getAllByHall, getByType, type ContentItem } from '../content';
import { ContentCard } from '../components/ContentCard';
import {
  EXPLORATION_VIEWS,
  explorationKind,
  matchesExplorationView,
  parseExplorationView,
  type ExplorationView,
} from '../shared/exploration';
import { isThinkingStatus } from '../shared/idea-status';
import { WEB_ROUTES } from '../shared/routes';

function getExplorations(): ContentItem[] {
  const candidates = [
    ...getAllByHall('showcase'),
    ...getByType('idea'),
    ...getByType('project'),
  ];
  return [...new Map(candidates.map((item) => [item.slug, item])).values()];
}

export function ExplorePage() {
  const items = useMemo(getExplorations, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseExplorationView(searchParams.get('view'));
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const visible = items.filter((item) => matchesExplorationView(item, view));

  function selectView(nextView: ExplorationView) {
    const next = new URLSearchParams(searchParams);
    if (nextView === 'all') next.delete('view');
    else next.set('view', nextView);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="ideas-page">
      <header className="ideas-intro panel-glass">
        <div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            <Compass size={24} className="page-title-icon" aria-hidden />
            探索
          </h1>
          <p className="page-lead" style={{ margin: 0 }}>
            从一个念头开始，在实践里逐渐长成。点子可以持续推进，项目是被明确立项的持续交付。共{' '}
            {items.length} 项。
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link to={WEB_ROUTES.lab} className="btn-secondary">
            札记
          </Link>
          <Link to={WEB_ROUTES.ferry} className="btn-secondary">
            <Ship size={16} aria-hidden />
            Ferry
          </Link>
        </div>
      </header>

      <div className="filter-tabs" role="tablist" aria-label="探索视图">
        {EXPLORATION_VIEWS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={view === candidate.id}
            className={`filter-tab${view === candidate.id ? ' is-active' : ''}`}
            onClick={() => selectView(candidate.id)}
          >
            {candidate.label}
            <span className="filter-count">
              {
                items.filter((item) =>
                  matchesExplorationView(item, candidate.id),
                ).length
              }
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="meta panel-glass" style={{ padding: '1.25rem' }}>
          这个阶段还没有公开探索。
        </p>
      ) : (
        <div className="ideas-tabletop">
          <div className="content-card-grid">
            {visible.map((item) => {
              const kind = explorationKind(item);
              const displayItem =
                item.type === kind ? item : { ...item, type: kind };
              const blurred =
                kind === 'idea' &&
                isThinkingStatus(item.status) &&
                !revealed[item.slug];
              return (
                <ContentCard
                  key={item.slug}
                  item={displayItem}
                  blurred={blurred}
                  onReveal={
                    blurred
                      ? () =>
                          setRevealed((current) => ({
                            ...current,
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
    </div>
  );
}
