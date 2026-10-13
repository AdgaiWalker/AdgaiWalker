/**
 * HomePage — 首页画布（页）
 * 职责：小影悬浮桌宠 + 身份卡 + 快捷入口 + 最近文章。
 * 小影停在页底的坞里；开口只亮当前一句。页的证据区不与坞重叠。
 *
 * 依赖：content、XiaoyingHome、GreetingCard
 * 触发：路由 /
 */
import { Link, useOutletContext } from 'react-router-dom';
import {
  ArrowRight,
  Bookmark,
  Compass,
  PenLine,
  User,
} from 'lucide-react';
import type { AppShellOutletContext } from '../components/AppShell';
import { XiaoyingHome } from '../components/xiaoying/XiaoyingHome';
import { getRecentPosts, getByType } from '../content';
import { GreetingCard } from '../components/GreetingCard';
import { dualEntry } from '../shared/dual-entry';
import { formatDateCompact, parseIsoDate } from '../shared/format';
import { WEB_ROUTES } from '../shared/routes';
import { SPARK_FALLBACKS } from '../shared/rules-ui';

export function HomePage() {
  const { petSearchRef } =
    useOutletContext<AppShellOutletContext>() ?? {};

  const knowledgePosts = getRecentPosts(20).filter((p) => p.type === 'knowledge');
  const recentPosts = (
    knowledgePosts.length ? knowledgePosts : getRecentPosts(8)
  ).slice(0, 6);
  const featured =
    recentPosts.find((p) => p.tags.includes('featured')) ?? recentPosts[0];

  const realIdeas = getByType('idea').map((i) => ({
    title: i.title,
    slug: i.slug,
    isReal: true as const,
  }));
  const sparks = [...realIdeas, ...SPARK_FALLBACKS];

  return (
    <div id="canvas-container" className="xiaoying-home">
      <XiaoyingHome searchRef={petSearchRef} />
      <div id="desktop-canvas">
        <div className="home-grid">
          <div
            className="directory-card panel-glass pop-in draggable-card"
            style={{ animationDelay: '0.04s' }}
          >
            <div className="directory-brand">
              <span className="directory-mark">W</span>
              <div>
                <div className="directory-name">Walker</div>
                <div className="directory-tagline" id="status-text">
                  用好 AI 做好事
                </div>
              </div>
            </div>
            {featured ? (
              <Link
                to={`${dualEntry.browse.path}/${encodeURIComponent(featured.slug)}`}
                className="directory-trace"
              >
                <span className="directory-trace-label">本周证据</span>
                <span className="directory-trace-title">{featured.title}</span>
                <ArrowRight size={12} aria-hidden />
              </Link>
            ) : null}
            <div className="directory-ghost-nav" aria-label="快捷">
              <Link to={dualEntry.ask.path}>{dualEntry.ask.label}</Link>
              <Link to={dualEntry.browse.path}>{dualEntry.browse.label}</Link>
            </div>
          </div>

          <div
            className="panel-glass pop-in draggable-card home-panel home-quick-panel"
            style={{ animationDelay: '0.12s' }}
          >
            <div className="mobile-section-head">
              <span>站内入口</span>
              <small>从感兴趣的地方开始</small>
            </div>
            {/* 与侧栏一致：不重复类型总览，只放正交深页 */}
            <div className="quick-grid">
              <Link to={WEB_ROUTES.explore} className="quick-link">
                <Compass size={15} aria-hidden />
                <span>探索</span>
              </Link>
              <Link to={dualEntry.browse.path} className="quick-link">
                <PenLine size={15} aria-hidden />
                <span>文章</span>
              </Link>
              <Link to={WEB_ROUTES.toolsResources} className="quick-link">
                <Bookmark size={15} aria-hidden />
                <span>资源</span>
              </Link>
              <Link to={WEB_ROUTES.me} className="quick-link">
                <User size={15} aria-hidden />
                <span>关于</span>
              </Link>
            </div>
          </div>

          <div className="home-col home-col-greeting pop-in draggable-card">
            <GreetingCard sparks={sparks} />
          </div>

          <div
            className="panel-glass pop-in draggable-card home-panel home-panel-pad home-recent-panel"
            style={{ animationDelay: '0.2s' }}
          >
            <div className="recent-header">
              <PenLine size={13} color="var(--color-brand)" aria-hidden />
              <span className="recent-label">最近{dualEntry.browse.title}</span>
              <Link to={dualEntry.browse.path} className="recent-more">
                全部
                <ArrowRight size={12} aria-hidden style={{ display: 'inline' }} />
              </Link>
            </div>
            <div className="recent-rail">
              {recentPosts.map((p, index) => (
                <Link
                  key={p.slug}
                  to={`${dualEntry.browse.path}/${encodeURIComponent(p.slug)}`}
                  className="recent-item"
                >
                  <span className="recent-item-index" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="recent-item-title">{p.title}</span>
                  <span className="recent-item-date">
                    {formatDateCompact(parseIsoDate(p.date))}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="xiaoying-dock" aria-hidden="true" />
    </div>
  );
}
