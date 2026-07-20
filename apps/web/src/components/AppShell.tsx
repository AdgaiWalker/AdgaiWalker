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
import { SearchModal } from './SearchModal';

const groups = [
  {
    items: [
      { label: '内容', href: '/content', icon: LayoutGrid, hint: 'Content' },
      { label: '关于', href: '/about', icon: User, hint: 'About' },
      { label: '支持', href: '/support', icon: Heart, hint: 'Support' },
    ],
  },
  {
    title: '空间',
    items: [
      { label: '项目', href: '/projects', icon: FolderKanban, hint: 'Projects' },
      { label: '学习', href: '/learn', icon: Rocket, hint: 'Learn' },
      { label: '资源', href: '/tools/resources', icon: Bookmark, hint: 'Tools' },
      { label: '点子', href: '/ideas', icon: Lightbulb, hint: 'Ideas' },
      { label: '文章', href: '/posts', icon: PenLine, hint: 'Posts' },
      { label: '问答', href: '/tools', icon: MessageCircleQuestion, hint: 'Ask' },
    ],
  },
];

export function AppShell() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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
        <div
          style={{
            position: 'fixed',
            top: 12,
            right: 12,
            zIndex: 30,
            display: 'flex',
            gap: 8,
          }}
        >
          <button type="button" className="btn-ghost" onClick={() => setSearchOpen(true)}>
            <Search size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> 搜索
          </button>
          <Link to="/login" className="btn-ghost" style={{ textDecoration: 'none' }}>
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
      <div className="mobile-bar">
        <button type="button" aria-label="菜单" onClick={() => setMenuOpen((v) => !v)}>
          <Menu size={20} />
        </button>
        <Link
          to="/"
          style={{ fontWeight: 700, color: 'var(--color-parchment)', textDecoration: 'none' }}
        >
          Walker
        </Link>
        <button
          type="button"
          className="btn-ghost"
          style={{ marginLeft: 'auto' }}
          onClick={() => setSearchOpen(true)}
        >
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
        <button type="button" className="app-search" onClick={() => setSearchOpen(true)}>
          <Search size={18} />
          <span>搜索</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.45 }}>⌘K</span>
        </button>

        <div style={{ flex: 1, overflow: 'auto', paddingBottom: 16 }}>
          {groups.map((g) => (
            <div key={g.title ?? 'main'} style={{ marginBottom: 12 }}>
              {g.title ? <div className="nav-section-title">{g.title}</div> : null}
              {g.items.map((item) => {
                const Ico = item.icon;
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    className={({ isActive }) =>
                      `nav-link ${isActive ? 'nav-link-active' : ''}`
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
          <a href="/rss.xml" aria-label="RSS" title="RSS（切流后可用）">
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
          <Link to="/login" className="btn-ghost" style={{ textDecoration: 'none' }}>
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
