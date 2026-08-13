/**
 * 项目（页）— 内容五类：实验中已做成的交付
 */
import { Link } from 'react-router-dom';
import { ArrowRight, FolderKanban, Ship } from 'lucide-react';
import { getAllByHall, getByType } from '../content';
import { ContentCard } from '../components/ContentCard';
import { WEB_ROUTES } from '../shared/routes';

export function ProjectsPage() {
  const byHall = getAllByHall('showcase').filter((i) => i.type !== 'idea');
  const byType = getByType('project');
  const slugs = new Set(byHall.map((i) => i.slug));
  const items = [
    ...byHall,
    ...byType.filter((i) => !slugs.has(i.slug)),
  ];

  return (
    <div>
      <header className="ideas-intro panel-glass">
        <div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            <FolderKanban size={26} aria-hidden className="page-title-icon" />
            项目
          </h1>
          <p className="page-lead" style={{ margin: 0 }}>
            已经做出来的东西——可看、可链、可检验。未对准需求的在「点子」。
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link
            to={WEB_ROUTES.ideas}
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            点子
            <ArrowRight size={14} />
          </Link>
          <Link
            to={WEB_ROUTES.ferry}
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Ship size={16} aria-hidden />
            Ferry
          </Link>
        </div>
      </header>

      {items.length === 0 ? (
        <p className="meta panel-glass" style={{ padding: '1.25rem' }}>
          暂无项目。
        </p>
      ) : (
        <div className="content-card-grid">
          {items.map((item) => (
            <ContentCard key={item.slug} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
