import { getByType } from '../content';
import { ItemList } from '../components/ItemList';

export function LearnPage() {
  const guides = getByType('learn');
  const byLevel = (level: string) => guides.filter((g) => g.level === level);
  return (
    <div>
      <h1 className="page-title">学习</h1>
      <p className="page-lead">指南 {guides.length} 篇</p>
      {(['入门', '学徒', '专家'] as const).map((level) => {
        const list = byLevel(level);
        if (!list.length) return null;
        return (
          <section
            key={level}
            className="panel-glass"
            style={{ padding: '1rem 1.25rem', borderRadius: 24, marginBottom: 16 }}
          >
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem' }}>{level}</h2>
            <ItemList items={list} />
          </section>
        );
      })}
      {guides.some((g) => !g.level) ? (
        <section className="panel-glass" style={{ padding: '1rem 1.25rem', borderRadius: 24 }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem' }}>其他</h2>
          <ItemList items={guides.filter((g) => !g.level)} />
        </section>
      ) : null}
    </div>
  );
}
