import { getAllItems } from '../content';
import { ItemList } from '../components/ItemList';

export function ContentPage() {
  const items = getAllItems();
  return (
    <div>
      <h1 className="page-title">内容宇宙</h1>
      <p className="page-lead">公开内容流 · {items.length} 条</p>
      <div className="panel-glass" style={{ padding: '0.5rem 1.25rem', borderRadius: 24 }}>
        <ItemList items={items} />
      </div>
    </div>
  );
}
