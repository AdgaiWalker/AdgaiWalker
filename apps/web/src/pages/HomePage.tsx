/**
 * HomePage — 「活着的书桌（Living Desk）」
 * 职责：左列 Dora 身份 + 3D 灵感翻牌；右列 统一对话/搜索唤醒舱 + 4 主入口 + 最近 5 篇；右下角按需 3D 小影。
 * 去重纪律：全屏只留 1 个品牌头、1 个主对话唤起、4 个不重复入口；严禁零碎堆砌。
 */
import { useMemo } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import type { AppShellOutletContext } from '../components/AppShell';
import { GreetingCard, type Spark } from '../components/GreetingCard';
import { ASSISTANT_EXAMPLES } from '../components/ui/AssistantThread';
import { XiaoyingHome } from '../components/xiaoying/XiaoyingHome';
import { getAllByHall, getBrowseItems, getByType, getRecentPosts } from '../content';
import { navigateWithViewTransition } from '../lib/view-transition';
import { dualEntry } from '../shared/dual-entry';
import { formatDateCompact, parseIsoDate } from '../shared/format';
import { primaryNavItems } from '../shared/nav';
import { SPARK_FALLBACKS } from '../shared/rules-ui';

export function HomePage() {
  const navigate = useNavigate();
  const { openSearch, petSearchRef } =
    useOutletContext<AppShellOutletContext>() ?? {};

  const { recentPosts, sparks } = useMemo(() => {
    const knowledgePosts = getRecentPosts(20).filter((p) => p.type === 'knowledge');
    const pool = knowledgePosts.length ? knowledgePosts : getBrowseItems();
    const recent = pool.slice(0, 5);

    const realDocs = [...getByType('idea'), ...getByType('wise'), ...getAllByHall('lab')];
    const unique = new Map<string, Spark>();
    for (const item of realDocs) {
      if (!unique.has(item.slug)) {
        unique.set(item.slug, {
          title: item.title,
          summary: item.summary,
          slug: item.slug,
          isReal: true,
        });
      }
    }
    const list: Spark[] = [...unique.values(), ...SPARK_FALLBACKS];
    return { recentPosts: recent, sparks: list };
  }, []);

  return (
    <div id="canvas-container" className="xiaoying-home living-desk">
      <div className="living-desk-grid">
        <div className="living-col-left">
          <GreetingCard
            sparks={sparks}
            onAskSpark={(title, trigger) => openSearch?.(trigger, title, 'card')}
          />
        </div>

        <div className="living-col-right">
          <section className="living-dock surface-l1" aria-label="站内快速对话与入口">
            <button
              type="button"
              className="living-dock-input"
              onClick={(e) => openSearch?.(e.currentTarget, undefined, 'card')}
            >
              <Search size={16} aria-hidden />
              <span>搜站内 {getBrowseItems().length} 篇文章，或直接问小影…</span>
              <kbd aria-hidden>⌘K</kbd>
            </button>

            <div className="living-dock-chips" aria-label="热门起手问">
              {ASSISTANT_EXAMPLES.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="living-chip"
                  onClick={(e) => openSearch?.(e.currentTarget, prompt, 'card')}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <nav className="living-nav-row" aria-label="站点主入口">
              {primaryNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} to={item.href} className="living-nav-pill">
                    <Icon size={15} aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </section>

          <section className="living-recent surface-l1" aria-label={`最近${dualEntry.browse.title}`}>
            <div className="recent-header">
              <span className="recent-label">最近{dualEntry.browse.title}</span>
              <Link to={dualEntry.browse.path} className="recent-more">
                <span>全部</span>
                <ArrowRight size={13} aria-hidden />
              </Link>
            </div>
            <div className="recent-rail">
              {recentPosts.map((p, index) => {
                const href = `${dualEntry.browse.path}/${encodeURIComponent(p.slug)}`;
                return (
                  <Link
                    key={p.slug}
                    to={href}
                    className="recent-item"
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                      e.preventDefault();
                      const titleEl = e.currentTarget.querySelector<HTMLElement>('.recent-item-title');
                      navigateWithViewTransition(navigate, href, { sourceElement: titleEl });
                    }}
                  >
                    <span className="recent-item-index" aria-hidden>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="recent-item-title">{p.title}</span>
                    <span className="recent-item-date">
                      {formatDateCompact(parseIsoDate(p.date))}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <XiaoyingHome searchRef={petSearchRef} />
      <div className="xiaoying-dock" aria-hidden="true" />
    </div>
  );
}
