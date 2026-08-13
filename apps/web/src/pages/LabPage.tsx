/**
 * 札记（页）— 内容五类：实验中的经验与思考
 * 路由仍为 /lab（兼容）；侧栏文案「札记」。
 */
import { Link } from 'react-router-dom';
import { ArrowRight, FlaskConical } from 'lucide-react';
import { getAllByHall, getPostsBySeries } from '../content';
import { ContentCard } from '../components/ContentCard';
import { LAB_LINES } from '../shared/constants';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';

function lineHref(routeKey: (typeof LAB_LINES)[number]['routeKey']): string | null {
  if (routeKey === 'advanceTrilogy') return WEB_ROUTES.advanceTrilogy;
  if (routeKey === 'ferry') return WEB_ROUTES.ferry;
  return null;
}

export function LabPage() {
  const labItems = getAllByHall('lab');
  const labSlugs = new Set(labItems.map((i) => i.slug));

  const lines = LAB_LINES.map((line) => ({
    ...line,
    href: lineHref(line.routeKey),
    posts: getPostsBySeries(line.series).filter((p) => labSlugs.has(p.slug)),
  })).filter((line) => line.posts.length > 0);

  const lined = new Set(lines.flatMap((l) => l.posts.map((p) => p.slug)));
  const unlined = labItems.filter((p) => !lined.has(p.slug));

  return (
    <div className="lab-page">
      <header className="ideas-intro panel-glass">
        <div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            <FlaskConical size={26} aria-hidden className="page-title-icon" />
            札记
          </h1>
          <p className="page-lead" style={{ margin: 0 }}>
            经验与思考——实验中沉淀的意识。教程在「教程」，点子/项目是另外两类实验产物。
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link to={WEB_ROUTES.ideas} className="btn-secondary">
            点子
          </Link>
          <Link to={WEB_ROUTES.projects} className="btn-secondary">
            项目
          </Link>
        </div>
      </header>

      {lines.length === 0 && unlined.length === 0 ? (
        <p className="meta panel-glass" style={{ padding: '1.25rem' }}>
          暂无札记。frontmatter 设 hall: lab。
        </p>
      ) : (
        <div className="lab-lines">
          {lines.map((line) => (
            <section
              key={line.series}
              className="lab-line panel-glass"
              aria-labelledby={`lab-line-${line.series}`}
            >
              <div className="lab-line-head">
                <div>
                  <h2 id={`lab-line-${line.series}`} className="lab-line-title">
                    {line.label}
                  </h2>
                  <p className="lab-line-blurb meta">{line.blurb}</p>
                </div>
                {line.href ? (
                  <Link
                    to={line.href}
                    className="btn-secondary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    专线
                    <ArrowRight size={14} />
                  </Link>
                ) : null}
              </div>
              <div className="content-card-grid">
                {line.posts.map((p) => (
                  <ContentCard key={p.slug} item={p} />
                ))}
              </div>
            </section>
          ))}
          {unlined.length > 0 ? (
            <section className="lab-line panel-glass" aria-labelledby="lab-unlined">
              <h2 id="lab-unlined" className="lab-line-title">
                其他
              </h2>
              <div className="content-card-grid" style={{ marginTop: '0.75rem' }}>
                {unlined.map((p) => (
                  <ContentCard key={p.slug} item={p} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <nav className="hall-chain meta" aria-label="内容五类">
        <span className="hall-chain-label">内容</span>
        <Link to={WEB_ROUTES.toolsResources} className="hall-chain-link">
          资源 <ArrowRight size={12} aria-hidden />
        </Link>
        <Link to={WEB_ROUTES.tutorials} className="hall-chain-link">
          教程 <ArrowRight size={12} aria-hidden />
        </Link>
        <Link to={WEB_ROUTES.ideas} className="hall-chain-link">
          点子 <ArrowRight size={12} aria-hidden />
        </Link>
        <Link to={WEB_ROUTES.projects} className="hall-chain-link">
          项目 <ArrowRight size={12} aria-hidden />
        </Link>
        <Link to={dualEntry.browse.path} className="hall-chain-link">
          逛 <ArrowRight size={12} aria-hidden />
        </Link>
      </nav>
    </div>
  );
}
