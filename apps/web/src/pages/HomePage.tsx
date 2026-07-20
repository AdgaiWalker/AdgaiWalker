import { Link } from 'react-router-dom';
import { ArrowRight, Bookmark, FolderKanban, Lightbulb, PenLine } from 'lucide-react';
import { getRecentPosts, getByType } from '../content';
import { getSolarTerm } from '../lib/solar-terms';
import { GreetingCard } from '../components/GreetingCard';
import { TEMP_SPARKS } from '../shared/rules-ui';
import { formatDateCompact } from '../shared/format';

function parseDate(iso: string): Date {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function HomePage() {
  const term = getSolarTerm(new Date());
  const knowledgePosts = getRecentPosts(20).filter((p) => p.type === 'knowledge');
  const recentPosts = (knowledgePosts.length ? knowledgePosts : getRecentPosts(4)).slice(0, 4);
  const featured = recentPosts.find((p) => p.tags.includes('featured')) ?? recentPosts[0];

  const realIdeas = getByType('idea').map((i) => ({
    title: i.title,
    slug: i.slug,
    isReal: true as const,
  }));
  const sparks = [...realIdeas, ...TEMP_SPARKS];

  return (
    <div id="canvas-container">
      <div id="desktop-canvas">
        <div className="seasonal-announcement pop-in" style={{ animationDelay: '0s' }}>
          <span className="seasonal-term">
            {term.name} · {term.english}
          </span>
          <span className="seasonal-sep">•</span>
          <span className="seasonal-poetic">{term.poetic}</span>
        </div>

        <div className="home-grid">
          <div className="flex flex-col gap-4" style={{ marginTop: '1.25rem' }}>
            <div
              className="directory-card panel-glass pop-in"
              style={{ animationDelay: '0.04s' }}
            >
              <div className="directory-brand">
                <span className="directory-mark">W</span>
                <div>
                  <div className="directory-name">Walker</div>
                  <div className="directory-tagline" id="status-text">
                    用 AI 走自己的路
                  </div>
                </div>
              </div>
              {featured ? (
                <Link
                  to={`/posts/${encodeURIComponent(featured.slug)}`}
                  className="directory-trace"
                >
                  <span className="directory-trace-label">最近</span>
                  <span className="directory-trace-title">{featured.title}</span>
                  <ArrowRight size={12} />
                </Link>
              ) : null}
              <div className="directory-ghost-nav">
                <Link to="/content">内容</Link>
                <Link to="/about">关于</Link>
              </div>
            </div>

            <div
              className="panel-glass pop-in"
              style={{ padding: '0.75rem', borderRadius: 20, animationDelay: '0.12s' }}
            >
              <div className="quick-grid">
                <Link to="/posts" className="quick-link">
                  <PenLine size={15} />
                  <span>文章</span>
                </Link>
                <Link to="/tools/resources" className="quick-link">
                  <Bookmark size={15} />
                  <span>资源</span>
                </Link>
                <Link to="/ideas" className="quick-link">
                  <Lightbulb size={15} />
                  <span>点子</span>
                </Link>
                <Link to="/projects" className="quick-link">
                  <FolderKanban size={15} />
                  <span>项目</span>
                </Link>
              </div>
            </div>

            <div
              className="panel-glass pop-in"
              style={{ padding: '1rem', borderRadius: 24, animationDelay: '0.2s' }}
            >
              <div className="recent-header">
                <PenLine size={13} color="var(--color-brand)" />
                <span className="recent-label">最近文章</span>
                <Link to="/posts" className="recent-more">
                  全部 →
                </Link>
              </div>
              <div>
                {recentPosts.map((p) => (
                  <Link
                    key={p.slug}
                    to={`/posts/${encodeURIComponent(p.slug)}`}
                    className="recent-item"
                  >
                    <span className="recent-item-title">{p.title}</span>
                    <span className="recent-item-date">
                      {formatDateCompact(parseDate(p.date))}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: '-0.5rem' }} className="pop-in">
            <GreetingCard sparks={sparks} />
          </div>
        </div>
      </div>
    </div>
  );
}
