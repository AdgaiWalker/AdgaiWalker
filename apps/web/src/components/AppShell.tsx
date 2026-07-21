import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Bookmark,
  Code2,
  FolderKanban,
  Heart,
  Home,
  LayoutGrid,
  Lightbulb,
  Mail,
  Menu,
  MessageCircleQuestion,
  PenLine,
  Rocket,
  Rss,
  Search,
  User,
} from 'lucide-react';
import { applySiteTheme, cycleThemeVisual } from '../lib/theme';
import { dualEntry } from '../shared/dual-entry';
import { SearchModal } from './SearchModal';

const evidenceGroup = {
  title: '证据库',
  items: [
    { label: '内容', href: '/content', icon: LayoutGrid, hint: 'Content' },
    { label: '学习', href: '/learn', icon: Rocket, hint: 'Learn' },
    { label: '点子', href: '/ideas', icon: Lightbulb, hint: 'Ideas' },
    { label: '项目', href: '/projects', icon: FolderKanban, hint: 'Projects' },
    { label: '资源', href: '/tools/resources', icon: Bookmark, hint: 'Tools' },
  ],
};

const siteGroup = {
  title: '站',
  items: [
    { label: '关于', href: '/about', icon: User, hint: 'About' },
    { label: '支持', href: '/support', icon: Heart, hint: 'Support' },
  ],
};

export function AppShell() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const askActive = pathname === dualEntry.ask.path;

  useEffect(() => {
    applySiteTheme();
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (isHome) {
    return (
      <>
        <div className="home-chrome">
          <Link to={dualEntry.ask.path} className="btn-primary">
            <MessageCircleQuestion size={15} />
            {dualEntry.ask.cta}
          </Link>
          <button type="button" className="btn-ghost" onClick={() => setSearchOpen(true)}>
            <Search size={14} />
            搜索
          </button>
          <Link to="/login" className="btn-ghost">
            登录
          </Link>
        </div>
        <Outlet />
        <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      </>
    );
  }

  return (
    <div className="app-layout">
      <div className="mobile-bar surface-l1">
        <button type="button" aria-label="菜单" onClick={() => setMenuOpen((v) => !v)}>
          <Menu size={20} />
        </button>
        <Link
          to="/"
          style={{ fontWeight: 700, color: 'var(--color-parchment)', textDecoration: 'none' }}
        >
          Walker
        </Link>
        <Link
          to={dualEntry.ask.path}
          className="btn-primary"
          style={{ marginLeft: 'auto', padding: '0.4rem 0.85rem', minHeight: 36 }}
        >
          {dualEntry.ask.shortCta}
        </Link>
        <button type="button" className="btn-ghost" onClick={() => setSearchOpen(true)}>
          搜索
        </button>
      </div>

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

        <button type="button" className="app-search" onClick={() => setSearchOpen(true)}>
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

          {[evidenceGroup, siteGroup].map((g) => (
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
            href="https://github.com/AdgaiWalker"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
          >
            <Code2 size={18} />
          </a>
          <a href="mailto:praxiswalker@gmail.com" aria-label="Email">
            <Mail size={18} />
          </a>
          <a href="/rss.xml" aria-label="RSS" title="RSS">
            <Rss size={16} />
          </a>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => cycleThemeVisual()}
            title="切换节气色"
          >
            主题
          </button>
          <Link to="/login" className="btn-ghost">
            登录
          </Link>
        </div>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
