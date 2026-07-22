/**
 * Ferry 项目页（页）
 * 职责：展示 series=Ferry 的笔记链；数据只来自 content 主题线查询。
 *
 * 依赖：content.getPostsBySeries、ContentCard
 * 调用：无 HTTP
 * 触发：/projects/ferry
 * 实现：主题线列表 + 卡牌网格
 */
import { Link } from 'react-router-dom';
import { ArrowRight, Ship } from 'lucide-react';
import { getPostsBySeries } from '../content';
import { ContentCard } from '../components/ContentCard';
import { FERRY_SERIES_NAME } from '../shared/constants';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';

export function FerryPage() {
  const posts = getPostsBySeries(FERRY_SERIES_NAME);

  return (
    <div>
      <header className="ideas-intro panel-glass">
        <div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            <Ship size={26} aria-hidden className="page-title-icon" />
            Ferry
          </h1>
          <p className="page-lead" style={{ margin: 0 }}>
            人机协作世界协议：从差距到行动、做减法、螺旋进化。下列为本站
            {FERRY_SERIES_NAME} 主题线公开笔记（{posts.length} 篇）。
          </p>
        </div>
        <Link
          to={WEB_ROUTES.projects}
          className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          全部项目
          <ArrowRight size={14} />
        </Link>
      </header>

      {posts.length === 0 ? (
        <p className="meta panel-glass" style={{ padding: '1.25rem' }}>
          暂无归入 {FERRY_SERIES_NAME} 线的公开文。可在 frontmatter 写 series:{' '}
          {FERRY_SERIES_NAME}。
        </p>
      ) : (
        <div className="content-card-grid">
          {posts.map((p) => (
            <ContentCard key={p.slug} item={p} />
          ))}
        </div>
      )}

      <p style={{ marginTop: '1.25rem' }}>
        <Link
          to={dualEntry.browse.path}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          去逛按主题线筛选
          <ArrowRight size={14} />
        </Link>
      </p>
    </div>
  );
}
