/**
 * 点子（页）— 内容五类：实验中未对准需求的苗
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Lightbulb } from 'lucide-react';
import { getAllByHall, getByType } from '../content';
import { ContentCard } from '../components/ContentCard';
import {
  IDEA_STATUS_FILTERS,
  isThinkingStatus,
  matchesIdeaFilter,
  type IdeaStatusFilter,
} from '../shared/idea-status';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';

export function IdeasPage() {
  const byType = useMemo(() => getByType('idea'), []);
  const byHall = useMemo(
    () => getAllByHall('showcase').filter((i) => i.type === 'idea'),
    [],
  );
  const ideas = useMemo(() => {
    const map = new Map(byType.map((i) => [i.slug, i]));
    for (const i of byHall) map.set(i.slug, i);
    return [...map.values()];
  }, [byType, byHall]);

  const [filter, setFilter] = useState<IdeaStatusFilter>('all');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const filtered = ideas.filter((i) => matchesIdeaFilter(i.status, filter));

  return (
    <div className="ideas-page">
      <header className="ideas-intro panel-glass">
        <div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            <Lightbulb size={22} className="page-title-icon" aria-hidden />
            点子
          </h1>
          <p className="page-lead" style={{ margin: 0 }}>
            实验中的苗：还没对准需求、或未完整做成。谈点子的哲学在「札记」。共{' '}
            {ideas.length} 条。
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link to={WEB_ROUTES.projects} className="btn-secondary">
            项目
          </Link>
          <Link to={WEB_ROUTES.lab} className="btn-secondary">
            札记
          </Link>
          <Link to={dualEntry.browse.path} className="btn-secondary">
            去逛
          </Link>
        </div>
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
                          setRevealed((r) => ({ ...r, [item.slug]: true }))
                      : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      <p style={{ marginTop: '1.25rem' }}>
        <Link
          to={WEB_ROUTES.lab}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          札记里谈「点子」的哲学
          <ArrowRight size={14} />
        </Link>
      </p>
    </div>
  );
}
