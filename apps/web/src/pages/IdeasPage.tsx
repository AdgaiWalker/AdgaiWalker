import { getByType } from '../content';
import { ItemList } from '../components/ItemList';

export function IdeasPage() {
  const items = getByType('idea');
  return (
    <div>
      <h1 className="page-title">点子</h1>
      <p className="page-lead">共 {items.length} 条</p>
      <div className="panel-glass" style={{ padding: '0.5rem 1.25rem', borderRadius: 24 }}>
        <ItemList items={items} />
      </div>
    </div>
  );
}
