/**
 * 教程（页）— 照着能做的步骤与跟学入口
 * 渠道/硬件等 how-to + 跟学课；数据：hall=condition ∪ type=learn
 */
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, GraduationCap } from 'lucide-react';
import { getAllByHall, getByType } from '../content';
import { ContentCard } from '../components/ContentCard';
import { WEB_ROUTES } from '../shared/routes';

export function TutorialsPage() {
  const howtos = getAllByHall('condition');
  const lessons = getByType('learn');

  return (
    <div className="tutorials-page">
      <header className="ideas-intro panel-glass">
        <div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            <BookOpen size={26} aria-hidden className="page-title-icon" />
            教程
          </h1>
          <p className="page-lead" style={{ margin: 0 }}>
            照着能做的步骤：搞到条件、跟上工具。不是札记，也不是外链清单——清单在资源。
          </p>
        </div>
        <Link
          to={WEB_ROUTES.toolsResources}
          className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          资源
          <ArrowRight size={14} />
        </Link>
      </header>

      <section className="lab-line panel-glass" style={{ marginBottom: '1rem' }}>
        <h2 className="lab-line-title">How-to</h2>
        <p className="lab-line-blurb meta">渠道、硬件、省钱与实操。</p>
        {howtos.length === 0 ? (
          <p className="meta" style={{ marginTop: '0.75rem' }}>
            暂无教程文。
          </p>
        ) : (
          <div className="content-card-grid" style={{ marginTop: '0.75rem' }}>
            {howtos.map((item) => (
              <ContentCard key={item.slug} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="lab-line panel-glass">
        <div className="lab-line-head">
          <div>
            <h2 className="lab-line-title">
              <GraduationCap
                size={18}
                aria-hidden
                style={{ verticalAlign: -3, marginRight: 6 }}
              />
              跟学
            </h2>
            <p className="lab-line-blurb meta">以用促学，把工具用起来。</p>
          </div>
          <Link to={WEB_ROUTES.learn} className="btn-secondary">
            跟学页
          </Link>
        </div>
        {lessons.length === 0 ? (
          <p className="meta">暂无跟学文。</p>
        ) : (
          <div className="content-card-grid">
            {lessons.map((item) => (
              <ContentCard key={item.slug} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
