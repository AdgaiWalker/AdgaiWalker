/**
 * Ferry 主题线（页）
 * 职责：series=Ferry；理论偏札记，交付偏项目。
 *
 * 依赖：content.getPostsBySeries、ContentCard
 * 触发：/projects/ferry
 */
import { Link } from 'react-router-dom';
import { ArrowRight, Ship } from 'lucide-react';
import { getPostsBySeries } from '../content';
import { ContentCard } from '../components/ContentCard';
import { FERRY_SERIES_NAME } from '../shared/constants';
import { explorationHref } from '../shared/exploration';
import { WEB_ROUTES } from '../shared/routes';

export function FerryPage() {
  const posts = getPostsBySeries(FERRY_SERIES_NAME);
  const theory = posts.filter((p) => p.type !== 'project');
  const delivered = posts.filter((p) => p.type === 'project');

  return (
    <div>
      <header className="ideas-intro panel-glass">
        <div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            <Ship size={26} aria-hidden className="page-title-icon" />
            Ferry
          </h1>
          <p className="page-lead" style={{ margin: 0 }}>
            人机协作世界协议：从差距到行动、做减法、螺旋进化。理论属札记；做成的协议与技能属探索中的项目（共{' '}
            {posts.length} 篇）。
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link
            to={WEB_ROUTES.lab}
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            札记
            <ArrowRight size={14} />
          </Link>
          <Link
            to={explorationHref('project')}
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            探索中的项目
            <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {posts.length === 0 ? (
        <p className="meta panel-glass" style={{ padding: '1.25rem' }}>
          暂无归入 {FERRY_SERIES_NAME} 线的公开文。可在 frontmatter 写 series:{' '}
          {FERRY_SERIES_NAME}。
        </p>
      ) : (
        <div className="lab-lines">
          {theory.length > 0 ? (
            <section className="lab-line panel-glass" aria-labelledby="ferry-theory">
              <div className="lab-line-head">
                <div>
                  <h2 id="ferry-theory" className="lab-line-title">
                    理论与意识
                  </h2>
                  <p className="lab-line-blurb meta">为何这样看世界——进札记。</p>
                </div>
              </div>
              <div className="content-card-grid">
                {theory.map((p) => (
                  <ContentCard key={p.slug} item={p} />
                ))}
              </div>
            </section>
          ) : null}
          {delivered.length > 0 ? (
            <section
              className="lab-line panel-glass"
              aria-labelledby="ferry-delivered"
            >
              <div className="lab-line-head">
                <div>
                  <h2 id="ferry-delivered" className="lab-line-title">
                    做成的交付
                  </h2>
                  <p className="lab-line-blurb meta">协议与技能产品——进探索的项目视图。</p>
                </div>
                <Link
                  to={explorationHref('project')}
                  className="btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  全部探索项目
                  <ArrowRight size={14} />
                </Link>
              </div>
              <div className="content-card-grid">
                {delivered.map((p) => (
                  <ContentCard key={p.slug} item={p} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <p
        style={{
          marginTop: '1.25rem',
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <Link
          to={WEB_ROUTES.advanceTrilogy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          前进三部曲
          <ArrowRight size={14} />
        </Link>
      </p>
    </div>
  );
}
