/**
 * 首页画布（页）
 * 职责：身份卡 + 快捷入口 + 最近文章 + Greeting；拖拽/缩放由 useHomeCanvas。
 * 进页默认布局（不持久化位移/缩放）；无主题线导航块。
 *
 * 依赖：content、useHomeCanvas、GreetingCard
 * 触发：路由 /
 */
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Compass,
  FlaskConical,
  MessageCircle,
  PenLine,
} from 'lucide-react';
import { getRecentPosts, getByType } from '../content';
import { GreetingCard } from '../components/GreetingCard';
import { useHomeCanvas } from '../hooks/useHomeCanvas';
import { dualEntry } from '../shared/dual-entry';
import { formatDateCompact, parseIsoDate } from '../shared/format';
import { WEB_ROUTES } from '../shared/routes';
import { SPARK_FALLBACKS } from '../shared/rules-ui';

export function HomePage() {
  useHomeCanvas(true);

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
    <div id="canvas-container">
      <div id="desktop-canvas">
        <div
          className="seasonal-announcement pop-in"
          style={{ animationDelay: '0s' }}
        >
          <span className="seasonal-term">Walker</span>
          <span className="seasonal-sep">·</span>
          <span className="seasonal-poetic">行过万里水路 · 卡与逛同一过程</span>
        </div>

        <div
          className="pop-in home-dual-lead meta"
          style={{ animationDelay: '0.02s' }}
        >
          <span className="home-mobile-kicker">今天，从这里继续</span>
          <h1 className="home-mobile-title">想解决一个问题，还是逛逛新的可能？</h1>
          <p style={{ margin: 0 }}>
            {dualEntry.browse.label}
            {dualEntry.browse.title}。有疑问问小影，卡住了去卡口。
          </p>
          <div className="home-dual-cta">
            <Link to={WEB_ROUTES.assistant} className="btn-primary">
              <MessageCircle size={16} aria-hidden />
              问小影
            </Link>
            <Link to={dualEntry.browse.path} className="btn-secondary">
              <PenLine size={16} aria-hidden />
              {dualEntry.browse.cta}
            </Link>
          </div>
          <p className="meta" style={{ margin: '6px 0 0' }}>
            想拿具体行动下一步？去
            <Link to={dualEntry.ask.path}>卡口</Link>
          </p>
          <p className="home-canvas-hint meta">
            拖拽卡片 · Ctrl/⌘+滚轮缩放 · 离开再进恢复默认
          </p>
        </div>

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
                    用 AI 走自己的路
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
                <Link to={dualEntry.browse.path}>{dualEntry.browse.label}</Link>
                <Link to={WEB_ROUTES.about}>关于</Link>
              </div>
            </div>

            <div
              className="panel-glass pop-in draggable-card home-panel home-quick-panel"
              style={{ animationDelay: '0.12s' }}
            >
              <div className="mobile-section-head">
                <span>去逛逛</span>
                <small>四条支路，随便拐进一条</small>
              </div>
              {/* 与侧栏一致：不重复类型总览，只放正交深页 */}
              <div className="quick-grid">
                <Link to={WEB_ROUTES.toolsResources} className="quick-link">
                  <Bookmark size={15} aria-hidden />
                  <span>资源</span>
                </Link>
                <Link to={WEB_ROUTES.tutorials} className="quick-link">
                  <BookOpen size={15} aria-hidden />
                  <span>教程</span>
                </Link>
                <Link to={WEB_ROUTES.explore} className="quick-link">
                  <Compass size={15} aria-hidden />
                  <span>探索</span>
                </Link>
                <Link to={WEB_ROUTES.lab} className="quick-link">
                  <FlaskConical size={15} aria-hidden />
                  <span>札记</span>
                </Link>
              </div>
            </div>

            <div className="home-col home-col-greeting pop-in draggable-card">
              <GreetingCard sparks={sparks} />
              <div className="xiaoying-card xiaoying-card-lg">
                <div className="xiaoying-head">
                  <span className="assistant-dot" aria-hidden />
                  <span className="xiaoying-name">小影</span>
                  <span className="xiaoying-line">
                    duola 的管家 · 关于这个站，问我就好
                  </span>
                </div>
                <div className="xiaoying-actions">
                  <Link to={WEB_ROUTES.assistant} className="btn-primary">
                    开始问
                    <ArrowRight
                      size={13}
                      aria-hidden
                      style={{ display: 'inline' }}
                    />
                  </Link>
                  <Link to={dualEntry.ask.path} className="btn-ghost">
                    我卡住了
                  </Link>
                </div>
              </div>
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
    </div>
  );
}
