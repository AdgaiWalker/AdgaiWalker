import { Link } from 'react-router-dom';
import { Ship } from 'lucide-react';
import { getByType } from '../content';
import { ItemList } from '../components/ItemList';
import { WEB_ROUTES } from '../shared/routes';

export function ProjectsPage() {
  const items = getByType('project');
  return (
    <div>
      <h1 className="page-title">项目</h1>
      <p className="page-lead">
        共 {items.length} 个 ·{' '}
        <Link
          to={WEB_ROUTES.ferry}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Ship size={16} aria-hidden />
          Ferry 协议
        </Link>
      </p>
      <div
        className="panel-glass"
        style={{ padding: '0.5rem 1.25rem', borderRadius: 24 }}
      >
        <ItemList items={items} />
      </div>
    </div>
  );
}
