import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bookmark,
  FolderKanban,
  Lightbulb,
  MessageCircleQuestion,
  PenLine,
} from 'lucide-react';
import { getRecentPosts, getByType } from '../content';
import { getSolarTerm } from '../lib/solar-terms';
import { GreetingCard } from '../components/GreetingCard';
import { dualEntry } from '../shared/dual-entry';
import { formatDateCompact, parseIsoDate } from '../shared/format';
import { WEB_ROUTES } from '../shared/routes';
import { SPARK_FALLBACKS } from '../shared/rules-ui';

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
  const sparks = [...realIdeas, ...SPARK_FALLBACKS];

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

        <div className="pop-in home-dual-lead meta" style={{ animationDelay: '0.02s' }}>
          <p style={{ margin: 0 }}>
            公开笔记，也是把卡点变成可检验交付的小机器。
          </p>
          <div className="home-dual-cta">
            <Link to={dualEntry.ask.path} className="btn-primary">
              <MessageCircleQuestion size={16} />
              {dualEntry.ask.cta}
            </Link>
            <Link to={dualEntry.browse.path} className="btn-secondary">
              <PenLine size={16} />
              {dualEntry.browse.cta}
            </Link>
          </div>
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
                  to={`${dualEntry.browse.path}/${encodeURIComponent(featured.slug)}`}
                  className="directory-trace"
                >
                  <span className="directory-trace-label">最近</span>
                  <span className="directory-trace-title">{featured.title}</span>
                  <ArrowRight size={12} />
                </Link>
              ) : null}
              <div className="directory-ghost-nav">
                <Link to={WEB_ROUTES.content}>内容</Link>
                <Link to={WEB_ROUTES.about}>关于</Link>
              </div>
            </div>

            <div
              className="panel-glass pop-in"
              style={{ padding: '0.75rem', borderRadius: 20, animationDelay: '0.12s' }}
            >
              <div className="quick-grid">
                <Link to={dualEntry.ask.path} className="quick-link quick-link-primary">
                  <MessageCircleQuestion size={16} />
                  <span>
                    {dualEntry.ask.label} · {dualEntry.ask.hint}
                  </span>
                </Link>
                <Link to={dualEntry.browse.path} className="quick-link quick-link-secondary">
                  <PenLine size={15} />
                  <span>{dualEntry.browse.label}</span>
                </Link>
                <Link to={WEB_ROUTES.toolsResources} className="quick-link">
                  <Bookmark size={15} />
                  <span>资源</span>
                </Link>
                <Link to={WEB_ROUTES.ideas} className="quick-link">
                  <Lightbulb size={15} />
                  <span>点子</span>
                </Link>
                <Link to={WEB_ROUTES.projects} className="quick-link">
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
                <Link to={dualEntry.browse.path} className="recent-more">
                  全部 →
                </Link>
              </div>
              <div>
                {recentPosts.map((p) => (
                  <Link
                    key={p.slug}
                    to={`${dualEntry.browse.path}/${encodeURIComponent(p.slug)}`}
                    className="recent-item"
                  >
                    <span className="recent-item-title">{p.title}</span>
                    <span className="recent-item-date">
                      {formatDateCompact(parseIsoDate(p.date))}
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
