/**
 * 学习 — 旧站 /learn「以用促学」分阶 + 指南列表，React 重写。
 * 深路径 guide/track 无独立内容源时，落到 content 分阶列表（不空挂路由）。
 */
import { Compass } from 'lucide-react';
import { getByType, getPublishedPosts } from '../content';
import { ItemList } from '../components/ItemList';
import { ContentCard } from '../components/ContentCard';

const LEVELS = [
  { id: '入门', label: '入门', desc: '先跑通一次，建立感觉' },
  { id: '学徒', label: '学徒', desc: '反复用，形成习惯' },
  { id: '专家', label: '专家', desc: '能教人、能交付' },
] as const;

export function LearnPage() {
  const guides = getByType('learn');
  const byLevel = (level: string) => guides.filter((g) => g.level === level);
  const unleveled = guides.filter((g) => !g.level);
  const recentThoughts = getPublishedPosts()
    .filter((p) => p.type === 'knowledge')
    .slice(0, 4);

  return (
    <div className="learn-page">
      <header className="learn-pane-header">
        <h1 className="page-title">以用促学，学有止，碰到在学。</h1>
        <p className="page-lead">指南 {guides.length} 篇 · 按阶段浏览，详情进逛阅读</p>
      </header>

      <div className="learn-quote panel-glass">
        <Compass size={18} className="learn-quote-icon" aria-hidden />
        <div>
          <p className="learn-quote-text">
            不追求把所有工具学完；碰到卡点再学，学完马上用回真实问题。
          </p>
          <p className="meta">Walker · 学习姿态</p>
        </div>
      </div>

      {LEVELS.map((lv) => {
        const list = byLevel(lv.id);
        if (!list.length) return null;
        return (
          <section key={lv.id} className="learn-layer panel-glass">
            <div className="learn-layer-head">
              <h2 className="learn-layer-title">{lv.label}</h2>
              <span className="meta">{lv.desc}</span>
            </div>
            <div className="content-card-grid learn-layer-grid">
              {list.map((item) => (
                <ContentCard key={item.slug} item={item} />
              ))}
            </div>
          </section>
        );
      })}

      {unleveled.length ? (
        <section className="learn-layer panel-glass">
          <h2 className="learn-layer-title">其他指南</h2>
          <ItemList items={unleveled} />
        </section>
      ) : null}

      {guides.length === 0 ? (
        <p className="meta panel-glass" style={{ padding: '1.25rem' }}>
          暂无 learn 类型内容。可在 content/log frontmatter 设 type: learn。
        </p>
      ) : null}

      {recentThoughts.length ? (
        <section className="learn-layer panel-glass">
          <h2 className="learn-layer-title">近期笔记（旁路）</h2>
          <p className="meta" style={{ marginBottom: 12 }}>
            旧站学习页含「思想时间线」；现用最近公开笔记承接。
          </p>
          <ItemList items={recentThoughts} />
        </section>
      ) : null}
    </div>
  );
}
