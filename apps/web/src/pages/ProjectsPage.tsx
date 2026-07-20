import { getByType } from '../content';
import { ItemList } from '../components/ItemList';

export function ProjectsPage() {
  const items = getByType('project');
  return (
    <div>
      <h1 className="page-title">项目</h1>
      <p className="page-lead">共 {items.length} 个</p>
      <div className="panel-glass" style={{ padding: '0.5rem 1.25rem', borderRadius: 24 }}>
        <ItemList items={items} />
      </div>
    </div>
  );
}
