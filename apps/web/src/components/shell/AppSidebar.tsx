/**
 * AppSidebar — 桌面侧栏：双入口 + 证据库/站导航 + 页脚
 * 证据库类型项指向 /posts?type=，高亮看 search 而非仅 pathname。
 */
import { Link, NavLink, useLocation } from 'react-router-dom';
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
};

function navItemActive(href: string, pathname: string): boolean {
  const path = href.split('?')[0] ?? href;
  if (path === dualEntry.browse.path) {
    return (
      pathname === dualEntry.browse.path ||
      pathname.startsWith(`${dualEntry.browse.path}/`)
    );
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function AppSidebar({
  menuOpen,
  askActive,
  onOpenSearch,
}: Props) {
  const { pathname } = useLocation();
  const browseActive = navItemActive(dualEntry.browse.path, pathname);

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
      <p
        className="meta"
        style={{ padding: '0 1rem 0.75rem', margin: 0, lineHeight: 1.45 }}
      >
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
        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.45 }}>
          ⌘K
        </span>
      </button>

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 16 }}>
        <div className="nav-group">
          <div className="nav-section-title">入口</div>
          <NavLink
            to={dualEntry.browse.path}
            className={() =>
              `nav-link nav-link-browse${browseActive ? ' nav-link-active' : ''}`
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
              const active = navItemActive(item.href, pathname);
              return (
                <NavLink
                  key={item.href}
                  to={item.href}
                  className={() => `nav-link${active ? ' nav-link-active' : ''}`}
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
        <Link
          to={WEB_ROUTES.login}
          className="btn-ghost"
          title="账号登录尚未开放"
        >
          账号
        </Link>
      </div>
    </aside>
  );
}
