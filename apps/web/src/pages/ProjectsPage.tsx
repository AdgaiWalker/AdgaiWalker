/**
 * 项目 — 旧站 /projects 列表 + Ferry 入口，React 重写。
 */
import { Link } from 'react-router-dom';
import { Ship } from 'lucide-react';
import { getByType } from '../content';
import { ContentCard } from '../components/ContentCard';
import { WEB_ROUTES } from '../shared/routes';

export function ProjectsPage() {
  const items = getByType('project');
  return (
    <div>
      <header className="ideas-intro panel-glass">
        <div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            项目
          </h1>
          <p className="page-lead" style={{ margin: 0 }}>
            共 {items.length} 个 · 做成的事、可检验的交付
          </p>
        </div>
        <Link
          to={WEB_ROUTES.ferry}
          className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Ship size={16} aria-hidden />
          Ferry 协议
        </Link>
      </header>

      {items.length === 0 ? (
        <p className="meta panel-glass" style={{ padding: '1.25rem' }}>
          暂无 project 类型内容。
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
