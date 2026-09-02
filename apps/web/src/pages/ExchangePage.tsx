/**
 * 交换 — 非公开内容一级；深页保留，链回内容路径
 */
import { Link } from 'react-router-dom';
import { ArrowRight, HandCoins } from 'lucide-react';
import { getPostBySlug } from '../content';
import { ContentCard } from '../components/ContentCard';
import { HallPageShell } from '../components/HallPageShell';
import { WEB_ROUTES } from '../shared/routes';

const SEED_SLUGS = ['idea-cocreate', 'side-hustle-blueprint'] as const;

export function ExchangePage() {
  const seeds = SEED_SLUGS.map((s) => getPostBySlug(s)).filter(Boolean);

  return (
    <HallPageShell
      title="交换"
      icon={HandCoins}
      lead="对外价值面（非公开内容一级）。有货再升格；现在只挂苗。"
      aside={
        <Link to={WEB_ROUTES.support} className="btn-secondary">
          支持
          <ArrowRight size={14} style={{ marginLeft: 6 }} />
        </Link>
      }
    >
      {seeds.length > 0 ? (
        <div className="content-card-grid">
          {seeds.map((item) =>
            item ? <ContentCard key={item.slug} item={item} /> : null,
          )}
        </div>
      ) : (
        <p className="meta panel-glass" style={{ padding: '1.25rem' }}>
          暂无交换苗。
        </p>
      )}
    </HallPageShell>
  );
}
