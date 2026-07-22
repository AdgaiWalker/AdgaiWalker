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
  FolderKanban,
  Lightbulb,
  MessageCircleQuestion,
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
          <p style={{ margin: 0 }}>
            公开笔记，也是把卡点变成可检验交付的小机器。
          </p>
          <div className="home-dual-cta">
            <Link to={dualEntry.ask.path} className="btn-primary">
              <MessageCircleQuestion size={16} aria-hidden />
              {dualEntry.ask.cta}
            </Link>
            <Link to={dualEntry.browse.path} className="btn-secondary">
              <PenLine size={16} aria-hidden />
              {dualEntry.browse.cta}
            </Link>
          </div>
          <p className="home-canvas-hint meta">
            拖拽卡片整理画布 · 按住 Ctrl（Mac 为 ⌘）滚轮缩放 · 离开再进恢复默认
          </p>
        </div>

        <div className="home-grid">
          <div className="home-col">
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
                  <span className="directory-trace-label">最近</span>
                  <span className="directory-trace-title">{featured.title}</span>
                  <ArrowRight size={12} aria-hidden />
                </Link>
              ) : null}
              {/* 隐形导航：音符跳动特效 */}
              <div className="directory-ghost-nav" aria-label="快捷">
                <Link to={WEB_ROUTES.content}>内容</Link>
                <Link to={WEB_ROUTES.about}>关于</Link>
              </div>
            </div>

            <div
              className="panel-glass pop-in draggable-card home-panel"
              style={{ animationDelay: '0.12s' }}
            >
              <div className="quick-grid">
                <Link to={WEB_ROUTES.toolsResources} className="quick-link">
                  <Bookmark size={15} aria-hidden />
                  <span>资源</span>
                </Link>
                <Link to={WEB_ROUTES.ideas} className="quick-link">
                  <Lightbulb size={15} aria-hidden />
                  <span>点子</span>
                </Link>
                <Link to={WEB_ROUTES.projects} className="quick-link">
                  <FolderKanban size={15} aria-hidden />
                  <span>项目</span>
                </Link>
                <Link to={WEB_ROUTES.learn} className="quick-link">
                  <PenLine size={15} aria-hidden />
                  <span>学习</span>
                </Link>
              </div>
            </div>

            <div
              className="panel-glass pop-in draggable-card home-panel home-panel-pad"
              style={{ animationDelay: '0.2s' }}
            >
              <div className="recent-header">
                <PenLine size={13} color="var(--color-brand)" aria-hidden />
                <span className="recent-label">最近文章</span>
                <Link to={dualEntry.browse.path} className="recent-more">
                  全部
                  <ArrowRight size={12} aria-hidden style={{ display: 'inline' }} />
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

          <div className="home-col home-col-greeting pop-in draggable-card">
            <GreetingCard sparks={sparks} />
          </div>
        </div>
      </div>
    </div>
  );
}
