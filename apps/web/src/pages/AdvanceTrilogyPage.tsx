/**
 * 前进三部曲（页）
 * 职责：展示 series=前进三部曲 的文章链；与教程/资源/跟学隔开。
 *
 * 依赖：content.getPostsBySeries、ContentCard
 * 调用：无 HTTP
 * 触发：/advance
 * 实现：主题线列表 + 卡牌网格（同 Ferry 页模式）
 */
import { Link } from 'react-router-dom';
import { ArrowRight, Compass } from 'lucide-react';
import { getPostsBySeries } from '../content';
import { ContentCard } from '../components/ContentCard';
import { ADVANCE_TRILOGY_SERIES_NAME } from '../shared/constants';
import { WEB_ROUTES } from '../shared/routes';

export function AdvanceTrilogyPage() {
  const posts = getPostsBySeries(ADVANCE_TRILOGY_SERIES_NAME);

  return (
    <div>
      <header className="ideas-intro panel-glass">
        <div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            <Compass size={26} aria-hidden className="page-title-icon" />
            {ADVANCE_TRILOGY_SERIES_NAME}
          </h1>
          <p className="page-lead" style={{ margin: 0 }}>
            为什么走 · 路上存下什么 · 走向哪里。三篇连读（{posts.length}{' '}
            篇），与教程、资源分开陈列。
          </p>
        </div>
        <Link
          to={WEB_ROUTES.lab}
          className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          札记
          <ArrowRight size={14} />
        </Link>
      </header>

      {posts.length === 0 ? (
        <p className="meta panel-glass" style={{ padding: '1.25rem' }}>
          暂无归入 {ADVANCE_TRILOGY_SERIES_NAME} 的公开文。可在 frontmatter 写
          series: {ADVANCE_TRILOGY_SERIES_NAME}。
        </p>
      ) : (
        <div className="content-card-grid">
          {posts.map((p) => (
            <ContentCard key={p.slug} item={p} />
          ))}
        </div>
      )}

      <p style={{ marginTop: '1.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Link
          to={WEB_ROUTES.ferry}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          Ferry 协议线
          <ArrowRight size={14} />
        </Link>
        <Link
          to={WEB_ROUTES.lab}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          回札记
          <ArrowRight size={14} />
        </Link>
      </p>
    </div>
  );
}
