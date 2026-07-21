/**
 * AppSidebar — 桌面侧栏：双入口 + 证据库/站导航 + 页脚
 */
import { Link, NavLink } from 'react-router-dom';
import {
  Code2,
  Home,
  Mail,
  MessageCircleQuestion,
  PenLine,
  Rss,
  Search,
} from 'lucide-react';
import { SITE_LINKS } from '../../shared/constants';
import { dualEntry } from '../../shared/dual-entry';
import { sidebarNavGroups } from '../../shared/nav';
import { WEB_ROUTES } from '../../shared/routes';

type Props = {
  menuOpen: boolean;
  askActive: boolean;
  onOpenSearch: () => void;
  onCycleTheme: () => void;
};

export function AppSidebar({
  menuOpen,
  askActive,
  onOpenSearch,
  onCycleTheme,
}: Props) {
  return (
    <aside className={`app-sidebar ${menuOpen ? 'is-open' : ''}`}>
      <div className="app-sidebar-head">
        <Link to="/" className="app-sidebar-title" aria-label="首页">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Home size={18} />
            Walker
          </span>
        </Link>
      </div>
      <p className="meta" style={{ padding: '0 1rem 0.75rem', margin: 0, lineHeight: 1.45 }}>
        <strong>{dualEntry.ask.label}</strong> {dualEntry.ask.hint} ·{' '}
        <strong>{dualEntry.browse.label}</strong> {dualEntry.browse.hint}
      </p>

      <div className="nav-group nav-group-primary">
        <Link
          to={dualEntry.ask.path}
          className={`nav-cta-ask${askActive ? ' is-active' : ''}`}
        >
          <MessageCircleQuestion size={18} />
          {dualEntry.ask.cta}
        </Link>
      </div>

      <button type="button" className="app-search" onClick={onOpenSearch}>
        <Search size={18} />
        <span>搜索</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.45 }}>⌘K</span>
      </button>

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 16 }}>
        <div className="nav-group">
          <div className="nav-section-title">入口</div>
          <NavLink
            to={dualEntry.browse.path}
            className={({ isActive }) =>
              `nav-link nav-link-browse${isActive ? ' nav-link-active' : ''}`
            }
          >
            <PenLine size={18} className="nav-link-icon" />
            <span>{dualEntry.browse.label}</span>
            <span className="nav-link-hint">{dualEntry.browse.hint}</span>
          </NavLink>
        </div>

        {sidebarNavGroups.map((g) => (
          <div key={g.title} className="nav-group">
            <div className="nav-section-title">{g.title}</div>
            {g.items.map((item) => {
              const Ico = item.icon;
              return (
                <NavLink
                  key={item.href}
                  to={item.href}
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' nav-link-active' : ''}`
                  }
                >
                  <Ico size={18} className="nav-link-icon" />
                  <span>{item.label}</span>
                  <span className="nav-link-hint">{item.hint}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </div>

      <div className="app-sidebar-foot">
        <a
          href={SITE_LINKS.github}
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
        >
          <Code2 size={18} />
        </a>
        <a href={SITE_LINKS.mailto} aria-label="Email">
          <Mail size={18} />
        </a>
        <a href={SITE_LINKS.rss} aria-label="RSS" title="RSS">
          <Rss size={16} />
        </a>
        <button
          type="button"
          className="btn-ghost"
          onClick={onCycleTheme}
          title="切换节气色"
        >
          主题
        </button>
        <Link to={WEB_ROUTES.login} className="btn-ghost">
          登录
        </Link>
      </div>
    </aside>
  );
}
